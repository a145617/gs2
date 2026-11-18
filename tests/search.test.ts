import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createThemePost, updatePost } from "@/server/services/posts";
import { seedThemePool } from "@/server/services/themes";
import { mute } from "@/server/services/moderation";
import { searchPosts, searchTags, searchUsers, trendingTags } from "@/server/services/search";
import { buildSearchText, escapeLike, splitQuery } from "@/lib/search";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-18T12:00:00+09:00");
const NEXT_DAY = new Date("2026-11-19T12:00:00+09:00");
const meta = { mode: "auto" as const };

describe("検索の文字列処理", () => {
  it("全角・半角、大文字・小文字の違いを吸収する", () => {
    expect(buildSearchText("ＳＫＹ　Tree", "夕方の空", ["夕焼け"])).toBe("sky tree 夕方の空 #夕焼け");
    expect(splitQuery("  空　 #夕焼け  ")).toEqual(["空", "#夕焼け"]);
    expect(escapeLike("100%_ok\\")).toBe("100\\%\\_ok\\\\");
  });
});

describe("投稿の検索（仕様: タイトル・キャプション・ハッシュタグで検索できる）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  async function setup() {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const viewer = await makeUser("検索する人");
    const img = () => makeImage("#3366cc", 64, 48);
    const p1 = (await createThemePost(a.viewer, { title: "放課後の窓", caption: "西日がきれい", tags: "夕焼け", meta }, await img(), AT)).post;
    const p2 = (await createThemePost(b.viewer, { title: "ＳＫＹ", caption: "雲がゆっくり流れる", tags: "空 雲", meta }, await img(), AT)).post;
    const p3 = (await createThemePost(a.viewer, { title: "猫", caption: "#夕焼け と猫", tags: "", meta }, await img(), AT)).post;
    return { a, b, viewer, p1, p2, p3 };
  }

  it("タイトル・キャプション・ハッシュタグのどれでも見つかる（翌日以降）", async () => {
    const { viewer, p1, p2, p3 } = await setup();
    const ids = async (q: string) => (await searchPosts(viewer.viewer, q, NEXT_DAY, null)).items.map((p) => p.id).sort();
    expect(await ids("放課後")).toEqual([p1.id]);
    expect(await ids("ゆっくり")).toEqual([p2.id]);
    expect(await ids("sky")).toEqual([p2.id]); // 全角で書いたタイトルも半角で見つかる
    expect(await ids("#夕焼け")).toEqual([p1.id, p3.id].sort());
    expect(await ids("夕焼け 猫")).toEqual([p3.id]); // 複数語はすべて含むもの
    expect(await ids("見つからない言葉")).toEqual([]);
    expect(await ids("%")).toEqual([]); // 特殊文字はそのまま文字として扱う
  });

  it("今日のお題に投稿していない人には、今日のほかの人の投稿は検索に出ない", async () => {
    const { viewer, p1 } = await setup();
    expect((await searchPosts(viewer.viewer, "放課後", AT, null)).items).toHaveLength(0);
    await createThemePost(viewer.viewer, { title: "わたし", caption: "", tags: "", meta }, await makeImage(), AT);
    expect((await searchPosts(viewer.viewer, "放課後", AT, null)).items.map((p) => p.id)).toEqual([p1.id]);
  });

  it("ミュートした人の投稿は検索に出ない", async () => {
    const { a, viewer } = await setup();
    await mute(viewer.viewer, a.id);
    expect((await searchPosts(viewer.viewer, "#夕焼け", NEXT_DAY, null)).items).toHaveLength(0);
  });

  it("編集すると検索用のテキストも更新される", async () => {
    const { a, viewer, p1 } = await setup();
    await updatePost(a.viewer, p1.id, { title: "朝の窓" }, AT);
    expect((await searchPosts(viewer.viewer, "放課後", NEXT_DAY, null)).items).toHaveLength(0);
    expect((await searchPosts(viewer.viewer, "朝の窓", NEXT_DAY, null)).items.map((p) => p.id)).toEqual([p1.id]);
  });

  it("ユーザー・ハッシュタグの検索、よく使われているタグ", async () => {
    const { a } = await setup();
    const users = await searchUsers(a.viewer, "検索");
    expect(users.map((u) => u.displayName)).toEqual([expect.stringContaining("検索する人")]);
    expect((await searchUsers(a.viewer, `@${a.handle}`)).map((u) => u.id)).toEqual([a.id]);
    expect((await searchTags("夕")).map((t) => t.name)).toEqual(["夕焼け"]);
    const trend = await trendingTags(NEXT_DAY);
    expect(trend[0]).toEqual({ name: "夕焼け", postCount: 2 });
  });
});
