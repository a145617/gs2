import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createThemePost, getPost } from "@/server/services/posts";
import { seedThemePool } from "@/server/services/themes";
import { follow, likePost } from "@/server/services/social";
import { mute } from "@/server/services/moderation";
import { buildFeedOrder, buildPreference, getFeedPage, popularity, preferenceScore } from "@/server/services/feed";
import { recordViews } from "@/server/services/views";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-18T12:00:00+09:00");
const meta = { mode: "auto" as const };
const later = (min: number) => new Date(AT.getTime() + min * 60_000);

async function post(user: Awaited<ReturnType<typeof makeUser>>, title: string, caption = "", at = AT, color = "#3366cc") {
  return (await createThemePost(user.viewer, { title, caption, tags: "", meta }, await makeImage(color, 64, 48), at)).post;
}

describe("フィード（仕様: 上部にフォローユーザーの投稿、その後は閲覧数・いいね・嗜好に合った投稿をランダムに表示）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("フォロー中の人の投稿が上部に、それ以外はその後に並ぶ（自分の投稿・ミュートした人の投稿は出ない）", async () => {
    const viewer = await makeUser("見る人");
    const followed = await makeUser("フォロー先");
    const others = [await makeUser("他1"), await makeUser("他2"), await makeUser("他3")];
    const muted = await makeUser("ミュート");
    await post(viewer, "自分");
    for (const [i, o] of others.entries()) await post(o, `他${i}`, "", later(i + 1));
    const f = await post(followed, "フォロー先の投稿", "", later(-30));
    const m = await post(muted, "ミュートの投稿");
    await follow(viewer.viewer, followed.id, AT);
    await mute(viewer.viewer, muted.id);

    const page = await getFeedPage(viewer.viewer, later(10), { seed: "s", offset: 0, limit: 10 });
    expect(page.items[0].id).toBe(f.id);
    expect(page.items[0].feedSection).toBe("following");
    expect(page.items.slice(1).every((p) => p.feedSection === "discover")).toBe(true);
    const ids = page.items.map((p) => p.id);
    expect(ids).not.toContain(m.id);
    expect(page.items.map((p) => p.title)).not.toContain("自分");
    expect(page.total).toBe(4);
  });

  it("同じ種なら同じ順番で、ページ送りしても重複しない。種が変わると順番も変わる", async () => {
    const viewer = await makeUser("見る人");
    await post(viewer, "自分");
    for (let i = 0; i < 20; i++) {
      const u = await makeUser(`u${i}`);
      await post(u, `投稿${i}`, "", later(i));
    }
    const a = await buildFeedOrder(viewer.viewer, later(60), "seed-a");
    const a2 = await buildFeedOrder(viewer.viewer, later(60), "seed-a");
    const b = await buildFeedOrder(viewer.viewer, later(60), "seed-b");
    expect(a2.ids).toEqual(a.ids);
    expect(b.ids).not.toEqual(a.ids);
    expect(new Set(b.ids)).toEqual(new Set(a.ids));

    const p1 = await getFeedPage(viewer.viewer, later(60), { seed: "seed-a", offset: 0, limit: 8 });
    const p2 = await getFeedPage(viewer.viewer, later(60), { seed: "seed-a", offset: 8, limit: 8 });
    const p3 = await getFeedPage(viewer.viewer, later(60), { seed: "seed-a", offset: 16, limit: 8 });
    const all = [...p1.items, ...p2.items, ...p3.items].map((p) => p.id);
    expect(all).toEqual(a.ids);
    expect(p3.nextCursor).toBeNull();
  });

  it("人気: いいね・閲覧が多いほど高く、時間がたつほど弱くなる", () => {
    const base = { likeCount: 0, commentCount: 0, bookmarkCount: 0, viewCount: 0, createdAt: AT };
    expect(popularity({ ...base, likeCount: 10 }, AT)).toBeGreaterThan(popularity({ ...base, likeCount: 1 }, AT));
    expect(popularity({ ...base, viewCount: 30 }, AT)).toBeGreaterThan(popularity({ ...base, viewCount: 3 }, AT));
    const old = { ...base, likeCount: 10, createdAt: new Date(AT.getTime() - 5 * 86400_000) };
    expect(popularity(old, AT)).toBeLessThan(popularity({ ...base, likeCount: 10 }, AT));
  });

  it("嗜好: いいねした投稿と同じハッシュタグ・似た色合いの投稿ほど好みとの近さが高い", async () => {
    const viewer = await makeUser("見る人");
    const a = await makeUser("A");
    await post(viewer, "自分");
    const liked = await post(a, "猫の写真", "#猫", AT, "#cc3333");
    await likePost(viewer.viewer, liked.id, AT);
    const pref = await buildPreference(viewer.id, later(5));
    expect(pref.signals).toBeGreaterThan(0);
    const colors = { dominant: [], hue: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], lightness: 45, chroma: 40 };
    const cat = preferenceScore({ tags: ["猫"], userId: "x", template: null, colors }, pref);
    const dog = preferenceScore({ tags: ["犬"], userId: "x", template: null, colors }, pref);
    expect(cat.tag).toBe(1);
    expect(dog.tag).toBe(0);
    expect(cat.total).toBeGreaterThan(dog.total);
  });

  it("おすすめの重み: 人気・好み・今日のお題が加点され、見たことのある投稿は出にくい", async () => {
    const viewer = await makeUser("見る人");
    await post(viewer, "自分");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const pa = await post(a, "A");
    const pb = await post(b, "B");
    await recordViews(viewer.viewer, [pa.id], later(1));
    const order = await buildFeedOrder(viewer.viewer, later(2), "x");
    const da = order.debug.get(pa.id)!;
    const db_ = order.debug.get(pb.id)!;
    expect(da.seen).toBe(true);
    expect(db_.seen).toBe(false);
    expect(da.themeBonus).toBeGreaterThan(0);
    expect(da.weight).toBeLessThan(db_.weight);
  });

  it("閲覧数は「見た人の数」。自分の投稿や、まだ見られない今日の投稿は数えない", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const c = await makeUser("C");
    const pa = await post(a, "A");
    // C はまだ投稿していないので、今日の投稿は見られない（数えない）
    expect(await recordViews(c.viewer, [pa.id], AT)).toBe(0);
    await post(b, "B");
    expect(await recordViews(b.viewer, [pa.id], AT)).toBe(1);
    expect(await recordViews(b.viewer, [pa.id], later(1))).toBe(0); // 2回目は数えない
    expect(await recordViews(a.viewer, [pa.id], AT)).toBe(0); // 自分の投稿
    expect((await getPost(a.viewer, pa.id, AT)).counts.views).toBe(1);
  });
});
