import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "@/server/db/client";
import { themePool, themes } from "@/server/db/schema";
import {
  endThemeNow,
  getCurrentTheme,
  getNextChangeAt,
  listPastThemes,
  scheduleTheme,
  seedThemePool,
  startThemeNow,
} from "@/server/services/themes";
import { resetDb } from "./support/db";

const jst = (s: string) => new Date(`${s}+09:00`);

describe("毎朝5時のお題（仕様: 一日に1回朝5時に抽象的なお題が提示される）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("お題の候補（抽象的なお題）が用意されている", async () => {
    const pool = await db.select().from(themePool);
    expect(pool.length).toBeGreaterThanOrEqual(60);
    const titles = pool.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(["空", "赤いもの", "落ち着く"]));
  });

  it("朝5時から翌朝5時まで同じお題が出る", async () => {
    const a = await getCurrentTheme(jst("2026-11-18T05:00:00"));
    const b = await getCurrentTheme(jst("2026-11-18T22:00:00"));
    const c = await getCurrentTheme(jst("2026-11-19T04:59:00"));
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(a.startsAt.toISOString()).toBe(jst("2026-11-18T05:00:00").toISOString());
    expect(a.endsAt.toISOString()).toBe(jst("2026-11-19T05:00:00").toISOString());
    expect(a.source).toBe("auto");
  });

  it("5時を過ぎると新しいお題に切り替わる", async () => {
    const before = await getCurrentTheme(jst("2026-11-19T04:59:59"));
    const after = await getCurrentTheme(jst("2026-11-19T05:00:00"));
    expect(after.id).not.toBe(before.id);
    expect(after.dayKey).toBe("2026-11-19");
  });

  it("前日と同じ表示テンプレートは続かない", async () => {
    let prev = await getCurrentTheme(jst("2026-11-01T06:00:00"));
    for (let d = 2; d <= 10; d++) {
      const day = String(d).padStart(2, "0");
      const t = await getCurrentTheme(jst(`2026-11-${day}T06:00:00`));
      expect(t.template).not.toBe(prev.template);
      prev = t;
    }
  });

  it("同時にアクセスしても、1日に作られるお題は1つだけ", async () => {
    const at = jst("2026-11-20T07:00:00");
    const results = await Promise.all(Array.from({ length: 6 }, () => getCurrentTheme(at)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect((await db.select().from(themes)).length).toBe(1);
  });

  it("管理者・デバッグ: 任意のお題を今すぐ開始でき、次の5時まで優先される", async () => {
    const at = jst("2026-11-18T13:00:00");
    const daily = await getCurrentTheme(at);
    const custom = await startThemeNow({ title: "階段", template: "film", source: "admin" }, at);
    expect((await getCurrentTheme(jst("2026-11-18T14:00:00"))).id).toBe(custom.id);
    expect(custom.endsAt.toISOString()).toBe(jst("2026-11-19T05:00:00").toISOString());
    // 翌朝5時には自動のお題に戻る
    const next = await getCurrentTheme(jst("2026-11-19T05:00:00"));
    expect(next.id).not.toBe(custom.id);
    expect(next.id).not.toBe(daily.id);
  });

  it("管理者: 予約したお題は開始時刻になると出題される", async () => {
    const at = jst("2026-11-18T10:00:00");
    await getCurrentTheme(at);
    const scheduled = await scheduleTheme({
      title: "影",
      template: "dark",
      source: "admin",
      startsAt: jst("2026-11-18T18:00:00"),
      endsAt: jst("2026-11-18T20:00:00"),
    });
    const cur = await getCurrentTheme(at);
    expect(cur.id).not.toBe(scheduled.id);
    expect((await getNextChangeAt(cur, at)).toISOString()).toBe(jst("2026-11-18T18:00:00").toISOString());
    expect((await getCurrentTheme(jst("2026-11-18T19:00:00"))).id).toBe(scheduled.id);
    // 予約したお題が終わると、その日のお題に戻る
    expect((await getCurrentTheme(jst("2026-11-18T20:30:00"))).id).toBe(cur.id);
  });

  it("管理者: 開催中のお題を終了すると、その日のお題に戻る（自動のお題を終了しても臨時のお題が出る）", async () => {
    const at = jst("2026-11-18T10:00:00");
    const daily = await getCurrentTheme(at);
    const custom = await startThemeNow({ title: "水たまり", template: "water", source: "debug" }, at);
    await endThemeNow(custom.id, jst("2026-11-18T11:00:00"));
    expect((await getCurrentTheme(jst("2026-11-18T11:30:00"))).id).toBe(daily.id);
    await endThemeNow(daily.id, jst("2026-11-18T12:00:00"));
    const fallback = await getCurrentTheme(jst("2026-11-18T12:30:00"));
    expect(fallback.id).not.toBe(daily.id);
    expect(fallback.endsAt.toISOString()).toBe(jst("2026-11-19T05:00:00").toISOString());
  });

  it("これまでのお題を新しい順に取得できる（未来の予約は含まない）", async () => {
    await getCurrentTheme(jst("2026-11-16T06:00:00"));
    await getCurrentTheme(jst("2026-11-17T06:00:00"));
    await scheduleTheme({
      title: "未来",
      template: "fog",
      source: "admin",
      startsAt: jst("2026-11-30T05:00:00"),
      endsAt: jst("2026-12-01T05:00:00"),
    });
    const list = await listPastThemes(jst("2026-11-17T12:00:00"));
    expect(list.map((t) => t.dayKey)).toEqual(["2026-11-17", "2026-11-16"]);
  });
});
