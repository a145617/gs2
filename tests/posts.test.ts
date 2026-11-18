import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db/client";
import { hashtags, posts } from "@/server/db/schema";
import {
  createThemePost,
  deletePost,
  getPost,
  listThemePosts,
  listUserPosts,
  updatePost,
} from "@/server/services/posts";
import { getCurrentTheme, seedThemePool } from "@/server/services/themes";
import { getObject } from "@/server/storage";
import { setSetting, SETTING_KEYS } from "@/server/settings";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const jst = (s: string) => new Date(`${s}+09:00`);
const AT = jst("2026-11-18T09:00:00");
const meta = { mode: "manual" as const, exposureTime: 1 / 250, iso: 100, fNumber: 1.8 };

describe("投稿（仕様: お題に沿った写真を撮影し投稿する）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("今日のお題に投稿でき、画像は3サイズのWebPで保存され、メタデータは消える", async () => {
    const a = await makeUser();
    const theme = await getCurrentTheme(AT);
    const { post, row } = await createThemePost(
      a.viewer,
      { title: "放課後の窓", caption: "#空 がきれい", tags: "夕焼け", themeId: theme.id, meta },
      await makeImage("#3366cc", 3000, 2000, { exif: true }),
      AT,
    );
    expect(post.title).toBe("放課後の窓");
    expect(post.theme?.id).toBe(theme.id);
    expect(post.tags).toEqual(["夕焼け", "空"].sort());
    expect(post.meta).toMatchObject({ exposureTime: 1 / 250, iso: 100, fNumber: 1.8 });
    expect(post.image?.width).toBe(2048);
    expect(post.image?.height).toBe(1365);
    expect(row.placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(row.colors.dominant.length).toBeGreaterThan(0);
    for (const v of ["lg", "md", "sm"]) {
      const obj = await getObject(`${row.imageKey}/${v}.webp`);
      expect(obj?.contentType).toBe("image/webp");
      const m = await sharp(Buffer.from(obj!.body as Uint8Array)).metadata();
      expect(m.exif).toBeUndefined(); // 撮影機種などのメタデータは書き出さない（位置情報も残らない）
    }
    // 画像のURLには推測できない文字列が含まれる
    expect(row.imageKey).toMatch(/^posts\/[0-9a-f-]{36}-[a-z2-9]{12}$/);
  });

  it("お題が切り替わった後に古いお題で投稿しようとすると拒否される", async () => {
    const a = await makeUser();
    const old = await getCurrentTheme(jst("2026-11-17T09:00:00"));
    await expect(
      createThemePost(a.viewer, { title: "t", caption: "", tags: "", themeId: old.id, meta }, await makeImage(), AT),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("1日の投稿数の上限（管理者設定）", async () => {
    const a = await makeUser();
    await setSetting(SETTING_KEYS.dailyPostLimit, 1);
    await createThemePost(a.viewer, { title: "1", caption: "", tags: "", meta }, await makeImage(), AT);
    await expect(
      createThemePost(a.viewer, { title: "2", caption: "", tags: "", meta }, await makeImage(), AT),
    ).rejects.toMatchObject({ status: 429 });
    await setSetting(SETTING_KEYS.dailyPostLimit, null);
    await createThemePost(a.viewer, { title: "3", caption: "", tags: "", meta }, await makeImage(), AT);
  });

  it("投稿後に、ほかのユーザーの今日の投稿が見られるようになる（それまでは中身を返さない）", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const admin = await makeUser("管理", "admin");
    const { post } = await createThemePost(a.viewer, { title: "Aの写真", caption: "秘密", tags: "空", meta }, await makeImage(), AT);

    const beforeB = await getPost(b.viewer, post.id, AT);
    expect(beforeB.locked).toBe(true);
    expect(beforeB.image).toBeNull();
    expect(beforeB.title).toBe("");
    expect(beforeB.caption).toBe("");
    expect(beforeB.placeholder).toMatch(/^data:image/);
    // 本人と管理者は常に見られる
    expect((await getPost(a.viewer, post.id, AT)).locked).toBe(false);
    expect((await getPost(admin.viewer, post.id, AT)).locked).toBe(false);
    // プロフィール・お題の一覧からも見えない
    expect((await listUserPosts(b.viewer, a.id, AT, null)).items[0].locked).toBe(true);

    await createThemePost(b.viewer, { title: "Bの写真", caption: "", tags: "", meta }, await makeImage("#cc3333"), AT);
    const afterB = await getPost(b.viewer, post.id, AT);
    expect(afterB.locked).toBe(false);
    expect(afterB.title).toBe("Aの写真");
    expect(afterB.image?.lg).toMatch(/^\/media\/posts\//);

    // 翌日（お題が変わった後）は、昨日のお題の投稿を誰でも見られる
    const c = await makeUser("C");
    const nextDay = jst("2026-11-19T09:00:00");
    expect((await getPost(c.viewer, post.id, nextDay)).locked).toBe(false);
  });

  it("本人はタイトル・キャプション・タグを編集でき、他人は編集・削除できない", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const { post } = await createThemePost(a.viewer, { title: "前", caption: "", tags: "古いタグ", meta }, await makeImage(), AT);
    await expect(updatePost(b.viewer, post.id, { title: "x" }, AT)).rejects.toMatchObject({ status: 403 });
    await expect(deletePost(b.viewer, post.id)).rejects.toMatchObject({ status: 403 });
    const edited = await updatePost(a.viewer, post.id, { title: "後", tags: "新しいタグ" }, AT);
    expect(edited.title).toBe("後");
    expect(edited.tags).toEqual(["新しいタグ"]);
    expect(edited.editedAt).not.toBeNull();
    const old = await db.query.hashtags.findFirst({ where: eq(hashtags.name, "古いタグ") });
    expect(old?.postCount).toBe(0);
  });

  it("削除すると見られなくなり、画像ファイルも消える", async () => {
    const a = await makeUser();
    const { post, row } = await createThemePost(a.viewer, { title: "消す", caption: "", tags: "", meta }, await makeImage(), AT);
    await deletePost(a.viewer, post.id);
    await expect(getPost(a.viewer, post.id, AT)).rejects.toMatchObject({ status: 404 });
    expect(await getObject(`${row.imageKey}/lg.webp`)).toBeNull();
    const [r] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(r.status).toBe("deleted");
  });

  it("お題・ユーザーごとの一覧を新しい順にページ送りできる", async () => {
    const a = await makeUser();
    const theme = await getCurrentTheme(AT);
    const ids: string[] = [];
    for (let i = 0; i < 26; i++) {
      const { post } = await createThemePost(
        a.viewer,
        { title: `写真${i}`, caption: "", tags: "", meta },
        await makeImage("#556677", 64, 48),
        new Date(AT.getTime() + i * 1000),
      );
      ids.push(post.id);
    }
    const p1 = await listThemePosts(a.viewer, theme.id, AT, null);
    expect(p1.items).toHaveLength(24);
    expect(p1.items[0].id).toBe(ids[25]);
    const p2 = await listThemePosts(a.viewer, theme.id, AT, p1.nextCursor);
    expect(p2.items.map((p) => p.id)).toEqual([ids[1], ids[0]]);
    expect(p2.nextCursor).toBeNull();
  });
});
