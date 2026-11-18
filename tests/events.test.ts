import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "@/server/db/client";
import { events } from "@/server/db/schema";
import {
  assignColor,
  createEvent,
  createEventPost,
  ensureAutoEvent,
  getCurrentEventInfo,
  getEventDetail,
  getAutoSchedule,
  setAutoSchedule,
} from "@/server/services/events";
import { seedThemePool } from "@/server/services/themes";
import { PRESETS, PRESET_KEYS, nameColor, pixelize, type PixelArt } from "@/lib/pixel-art";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-20T12:00:00+09:00");
const HOUR = 3600_000;
const meta = { mode: "auto" as const };

const TWO_COLORS: PixelArt = {
  w: 2,
  h: 2,
  palette: [
    { hex: "#12131c", name: "夜の黒" },
    { hex: "#d64545", name: "赤" },
  ],
  cells: [0, 0, 1, 1],
};

async function makeEvent(art: PixelArt = TWO_COLORS) {
  return createEvent({
    title: "テストの絵",
    art,
    startsAt: new Date(AT.getTime() - HOUR),
    endsAt: new Date(AT.getTime() + 48 * HOUR),
    source: "debug",
  });
}

describe("ピクセルアート", () => {
  it("プリセットはどの大きさでも作れる", () => {
    for (const key of PRESET_KEYS) {
      for (const [w, h] of [
        [8, 8],
        [24, 24],
      ]) {
        const art = PRESETS[key].build(w, h);
        expect(art.cells).toHaveLength(w * h);
        expect(art.palette.length).toBeGreaterThanOrEqual(2);
        expect(Math.max(...art.cells)).toBe(art.palette.length - 1);
      }
    }
  });

  it("画像を減色してピクセルアートにできる（色には名前が付く）", () => {
    const rgb: number[] = [];
    for (let i = 0; i < 64; i++) rgb.push(...(i < 32 ? [220, 40, 40] : [30, 60, 200]));
    const art = pixelize(rgb, 8, 8, 4);
    expect(art.palette.length).toBe(2);
    expect(art.palette.map((p) => p.name).sort()).toEqual(["赤", "青"].sort());
    expect(nameColor("#111111")).toBe("黒");
  });
});

describe("イベント（仕様: 特定の色を指定され、その色を多く含む写真を1ピクセルとして集め、1つの絵を完成させる）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("参加者には、埋まっていないマスが多く担当者の少ない色が偏りなく割り当てられる", async () => {
    const ev = await makeEvent();
    const a = await makeUser("A");
    const b = await makeUser("B");
    const ca = await assignColor(ev.id, a.id);
    const cb = await assignColor(ev.id, b.id);
    expect(new Set([ca, cb]).size).toBe(2);
    expect(await assignColor(ev.id, a.id)).toBe(ca); // 一度決まった色は変わらない
    const info = await getCurrentEventInfo(a.viewer, AT);
    expect(info.event?.id).toBe(ev.id);
    expect(info.myColor?.index).toBe(ca);
  });

  it("指定の色が多い写真だけ受け付け、その色の空きマスを1つ埋める", async () => {
    const ev = await makeEvent();
    const u = await makeUser("U");
    const color = TWO_COLORS.palette[await assignColor(ev.id, u.id)];
    const other = TWO_COLORS.palette.find((p) => p.hex !== color.hex)!;
    await expect(
      createEventPost(u.viewer, ev.id, { title: "違う色", caption: "", tags: "", meta }, await makeImage(other.hex), AT),
    ).rejects.toMatchObject({ status: 400 });

    const res = await createEventPost(u.viewer, ev.id, { title: "夜空", caption: "", tags: "", meta }, await makeImage(color.hex), AT);
    expect(res.coverage).toBeGreaterThan(0.9);
    expect(TWO_COLORS.cells[res.cellIndex]).toBe(TWO_COLORS.palette.indexOf(color));
    expect(res.post.kind).toBe("event");
    expect(res.post.event?.colorName).toBe(color.name);
    const detail = await getEventDetail(u.viewer, ev.id, AT);
    const cell = detail.cells.find((c) => c.i === res.cellIndex)!;
    expect(cell.postId).toBe(res.post.id);
    expect(cell.tile).toMatch(/^data:image\/webp/);
    expect(detail.event.filledCells).toBe(1);
    expect(detail.myColor?.myPosts).toBe(1);
  });

  it("担当の色が埋まりきったら別の色が割り当てられ、すべて埋まると絵が完成する", async () => {
    const ev = await makeEvent();
    const u = await makeUser("U");
    const v = await makeUser("V");
    const shoot = async (who: typeof u) => {
      const idx = await assignColor(ev.id, who.id);
      return createEventPost(who.viewer, ev.id, { title: "x", caption: "", tags: "", meta }, await makeImage(TWO_COLORS.palette[idx].hex, 64, 64), AT);
    };
    const r1 = await shoot(u);
    const r2 = await shoot(u);
    expect(r2.cellIndex).not.toBe(r1.cellIndex);
    // u の色が埋まりきったので、次は別の色が割り当てられる
    const next = await assignColor(ev.id, u.id);
    expect(TWO_COLORS.cells[r1.cellIndex]).not.toBe(next);
    await shoot(v);
    const last = await shoot(u);
    expect(last.completed).toBe(true);
    const [row] = await db.select().from(events);
    expect(row.completedAt).not.toBeNull();
    const detail = await getEventDetail(u.viewer, ev.id, AT);
    expect(detail.event.status).toBe("completed");
    expect(detail.cells.every((c) => c.postId)).toBe(true);
    await expect(shoot(v)).rejects.toMatchObject({ status: 409 });
  });

  it("不定期に（1週間に1度程度）自動で開催される", async () => {
    await setAutoSchedule({ enabled: true, nextAutoAt: null });
    await ensureAutoEvent(AT);
    const sched = await getAutoSchedule();
    const next = new Date(sched.nextAutoAt!);
    const days = (next.getTime() - AT.getTime()) / 86400_000;
    expect(days).toBeGreaterThan(0.5);
    expect(days).toBeLessThan(8);
    // 予定日時を過ぎると始まる（同時に何度呼んでも1つだけ）
    const due = new Date(next.getTime() + 60_000);
    await Promise.all([ensureAutoEvent(due), ensureAutoEvent(due), ensureAutoEvent(due)]);
    const rows = await db.select().from(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("auto");
    expect(rows[0].endsAt.getTime() - rows[0].startsAt.getTime()).toBe(72 * HOUR);
    const after = new Date((await getAutoSchedule()).nextAutoAt!);
    expect((after.getTime() - due.getTime()) / 86400_000).toBeGreaterThan(4);
  });

  it("夜空（黒）の写真で黒のマスを埋められる（例: 黒が指定されたので夜空を撮る）", async () => {
    const ev = await makeEvent({ w: 2, h: 2, palette: [{ hex: "#12131c", name: "夜の黒" }], cells: [0, 0, 0, 0] });
    const u = await makeUser("U");
    // Unsplash の星空の写真
    const night = await makeImage("#12131c", 400, 300);
    const res = await createEventPost(u.viewer, ev.id, { title: "夜空", caption: "", tags: "", meta }, night, AT);
    expect(res.coverage).toBeGreaterThan(0.8);
  });
});
