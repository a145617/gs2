import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, db } from "@/server/db/client";
import { follows, notifications, posts, users } from "@/server/db/schema";
import { now } from "@/server/clock";
import { setSetting, SETTING_KEYS } from "@/server/settings";
import { createThemePost } from "@/server/services/posts";
import { getCurrentTheme, seedThemePool } from "@/server/services/themes";
import { createEvent, findCurrentEvent, getEventDetail } from "@/server/services/events";
import {
  endCurrentTheme,
  ensureTestAdmin,
  fillEventCells,
  getDebugStatus,
  listTestUsers,
  purgeTestData,
  seedDemoData,
  sendTestReports,
  shiftClock,
  startDebugTheme,
  triggerAutoEvent,
} from "@/server/services/debug";
import { runSelfTests } from "@/server/services/selftest";
import { photosNearColor } from "@/server/debug/demo-photos";
import { themeDayKey } from "@/lib/time";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const HOUR = 3600_000;
const meta = { mode: "auto" as const };

describe("デバッグモード（仕様: 任意のタイミング・内容でのお題とイベントの開催、その他確認に必要な機能）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
    await shiftClock({ type: "reset" });
  });
  afterEach(async () => {
    await shiftClock({ type: "reset" });
  });
  afterAll(closeDb);

  it("仮想時計で朝5時の直前に進めると、5時を過ぎたところで次の日のお題に切り替わる", async () => {
    const r = await shiftClock({ type: "beforeRollover", seconds: 30 });
    const at = await now();
    expect(Math.abs(at.getTime() - r.now.getTime())).toBeLessThan(2000);
    const jst = new Date(at.getTime() + 9 * HOUR);
    expect(jst.getUTCHours()).toBe(4);
    expect(jst.getUTCMinutes()).toBe(59);
    const before = await getCurrentTheme(at);
    await shiftClock({ type: "add", ms: 31_000 });
    const after = await getCurrentTheme(await now());
    expect(after.id).not.toBe(before.id);
    expect(after.dayKey).toBe(themeDayKey(await now()));
    expect(after.dayKey).not.toBe(before.dayKey);

    await shiftClock({ type: "add", ms: 24 * HOUR });
    expect((await now()).getTime() - at.getTime()).toBeGreaterThan(24 * HOUR);
    await shiftClock({ type: "reset" });
    expect(Math.abs((await now()).getTime() - Date.now())).toBeLessThan(2000);
  });

  it("任意の内容・表示テンプレートのお題を今すぐ始め、終わらせられる", async () => {
    const me = await makeUser("確認する人");
    const at = await now();
    const t = await startDebugTheme(me.viewer, { title: "デバッグ空", template: "kaleido" }, at);
    expect(await getCurrentTheme(at)).toMatchObject({ id: t.id, title: "デバッグ空", template: "kaleido", source: "debug" });
    const random = await startDebugTheme(me.viewer, {}, new Date(at.getTime() + 1000));
    expect(random.title).not.toBe("");
    const next = await endCurrentTheme(new Date(at.getTime() + 2000));
    expect(next.id).not.toBe(random.id);
  });

  it("ダミーデータ（テスト用ユーザーの投稿・いいね・コメント・フォロー）を作り、まとめて削除できる", async () => {
    const me = await makeUser("確認する人");
    const at = await now();
    const { post: mine } = await createThemePost(me.viewer, { title: "自分の投稿", caption: "", tags: "", meta }, await makeImage(), at);
    const r = await seedDemoData(me.viewer, { users: 4, postsPerUser: 2 }, at);
    expect(r).toMatchObject({ users: 4, posts: 8 });
    expect(await listTestUsers()).toHaveLength(4);
    const myRow = await db.query.posts.findFirst({ where: eq(posts.id, mine.id) });
    expect(myRow?.likeCount).toBe(3);
    expect(myRow?.commentCount).toBe(1);
    const myFollows = await db.select().from(follows).where(eq(follows.followerId, me.id));
    expect(myFollows).toHaveLength(2);
    const status = await getDebugStatus({ id: me.id, impersonatorId: null }, at);
    expect(status.testPosts).toBe(8);
    expect(status.testUsers).toHaveLength(4);

    const purged = await purgeTestData();
    expect(purged).toEqual({ users: 4, posts: 8 });
    expect(await listTestUsers()).toHaveLength(0);
    const after = await db.query.posts.findFirst({ where: eq(posts.id, mine.id) });
    expect(after).toMatchObject({ likeCount: 0, commentCount: 0 });
    expect(await db.select().from(follows).where(eq(follows.followerId, me.id))).toHaveLength(0);
    // テスト用ユーザーからのお知らせも消える
    const left = await db.select().from(notifications).where(eq(notifications.userId, me.id));
    expect(left.filter((n) => n.actorId !== null)).toHaveLength(0);
  });

  it("ダミーの投稿には Unsplash の写真を使い、お題に合う写真を優先する（撮影者をキャプションに表示）", async () => {
    const me = await makeUser("確認する人");
    const at = await now();
    await startDebugTheme(me.viewer, { title: "雨", template: "window" }, at);
    const r = await seedDemoData(me.viewer, { users: 2, postsPerUser: 2 }, at);
    // 「雨」のタグを持つ写真は3枚（窓の雨粒・雨の日の緑・雨の日の傘）。残りの1枚はほかの写真
    expect(r).toMatchObject({ posts: 4, matched: 3 });
    const testUsers = await listTestUsers();
    const rows = await db.select().from(posts).where(inArray(posts.userId, testUsers.map((u) => u.id)));
    const titles = rows.map((p) => p.title);
    expect(titles).toEqual(expect.arrayContaining(["窓の雨粒", "雨の日の緑", "雨の日の傘"]));
    for (const p of rows) {
      expect(p.caption).toMatch(/写真: .+（Unsplash）/);
      expect(p.caption).toContain("#雨");
      expect(p.width).toBeGreaterThan(600);
    }
  });

  it("開催中のイベントのマスをテスト用ユーザーの写真で埋められ、全部埋まると完成する", async () => {
    const me = await makeUser("確認する人");
    const at = await now();
    const ev = await createEvent({
      title: "デバッグの絵",
      art: { w: 2, h: 3, palette: [{ hex: "#12131c", name: "夜の黒" }, { hex: "#d64545", name: "赤" }], cells: [0, 1, 0, 1, 0, 1] },
      startsAt: new Date(at.getTime() - HOUR),
      endsAt: new Date(at.getTime() + HOUR),
      source: "debug",
    });
    const first = await fillEventCells(null, 2, at);
    expect(first).toMatchObject({ eventId: ev.id, filled: 2, remaining: 4, completed: false });
    const rest = await fillEventCells(ev.id, "all", at);
    expect(rest).toMatchObject({ filled: 4, remaining: 0, completed: true });
    const detail = await getEventDetail(me.viewer, ev.id, at);
    expect(detail.event.status).toBe("completed");
    expect(detail.cells.every((c) => c.postId && c.tile)).toBe(true);
    // マスは、その色に近い Unsplash の写真で埋まる（撮影者をキャプションに表示）
    const p = await db.query.posts.findFirst({ where: eq(posts.id, detail.cells[1].postId!) });
    const nearRed = photosNearColor("#d64545").slice(0, 3).map((x) => x.title);
    expect(nearRed).toContain(p?.title);
    expect(p?.caption).toContain("「赤」の1ピクセルに");
    expect(p?.caption).toMatch(/写真: .+（Unsplash）/);
    await expect(fillEventCells(null, 1, new Date(at.getTime() + 2 * HOUR))).rejects.toMatchObject({ status: 400 });
  });

  it("不定期の自動開催を今すぐ発生させられる（開催中のイベントがあるときは始まらない）", async () => {
    const at = await now();
    const ev = await triggerAutoEvent(at);
    expect(ev.source).toBe("auto");
    expect((await findCurrentEvent(at))?.id).toBe(ev.id);
    await expect(triggerAutoEvent(at)).rejects.toMatchObject({ status: 400 });
  });

  it("テスト用ユーザーから通報を送ると、件数に応じて自動で非表示になる", async () => {
    const me = await makeUser("確認する人");
    const at = await now();
    await setSetting(SETTING_KEYS.autoHideReports, 3);
    const { post } = await createThemePost(me.viewer, { title: "通報される投稿", caption: "", tags: "", meta }, await makeImage(), at);
    const r = await sendTestReports(me.viewer, { count: 3 });
    expect(r).toMatchObject({ postId: post.id, sent: 3, autoHidden: true });
    expect((await db.query.posts.findFirst({ where: eq(posts.id, post.id) }))?.status).toBe("hidden");
    // 2回目は同じ人からは送られない
    expect((await sendTestReports(me.viewer, { count: 3 })).sent).toBe(0);
  });

  it("管理者機能の確認用に、テスト用の管理者を用意できる", async () => {
    const a = await ensureTestAdmin();
    const b = await ensureTestAdmin();
    expect(a.id).toBe(b.id);
    const row = await db.query.users.findFirst({ where: and(eq(users.id, a.id), eq(users.isTestUser, true)) });
    expect(row?.role).toBe("admin");
  });

  it("デバッグモードが無効なら、デバッグ用のAPIは存在しないもの（404）として扱われ、仮想時計も効かない", async () => {
    const { GET: status } = await import("@/app/api/debug/status/route");
    const { POST: clock } = await import("@/app/api/debug/clock/route");
    const { POST: seed } = await import("@/app/api/debug/seed/route");
    await shiftClock({ type: "add", ms: 5 * HOUR });
    process.env.DEBUG_MODE = "false";
    try {
      const ctx = undefined as never;
      expect((await status(new NextRequest("http://localhost/api/debug/status"), ctx)).status).toBe(404);
      const post = (url: string, body: unknown) =>
        new NextRequest(url, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body) });
      expect((await clock(post("http://localhost/api/debug/clock", { type: "reset" }), ctx)).status).toBe(404);
      expect((await seed(post("http://localhost/api/debug/seed", {}), ctx)).status).toBe(404);
      // 仮想時計の設定が残っていても、実際の時刻で動く
      await new Promise((r) => setTimeout(r, 1100));
      expect(Math.abs((await now()).getTime() - Date.now())).toBeLessThan(2000);
    } finally {
      process.env.DEBUG_MODE = "true";
    }
  });

  it("自己診断（DB・画像の保存・写真の処理・お題の切り替え計算など）がすべて通る", async () => {
    const results = await runSelfTests();
    const failed = results.filter((r) => !r.ok);
    expect(failed).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(10);
  });
});
