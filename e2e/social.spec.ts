import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { open, signup } from "./helpers";

/** APIで手早く投稿する（撮影の流れは posting.spec.ts で確認済み） */
async function quickPost(page: Page, title: string, caption = "", fixture = "photo.jpg") {
  const theme = await (await page.request.get("/api/themes/current")).json();
  const buffer = await readFile(path.join(import.meta.dirname, "fixtures", fixture));
  const res = await page.request.post("/api/posts", {
    multipart: {
      image: { name: "photo.jpg", mimeType: "image/jpeg", buffer },
      title,
      caption,
      tags: "",
      themeId: theme.theme.id,
      meta: JSON.stringify({ mode: "library" }),
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).post as { id: string };
}

test.describe("いいね・コメント・ブックマーク・フォロー・お知らせ・ハッシュタグ", () => {
  test("ほかのユーザーの投稿にいいね・コメント・ブックマークし、相手にお知らせが届く", async ({ page, browser }) => {
    const author = await signup(page, { name: "投稿した人" });
    const tag = `タグ${Date.now().toString(36)}`;
    const post = await quickPost(page, "ひとこまの空", `雲がきれい #${tag}`);
    const authorHandle = (await (await page.request.get("/api/me")).json()).user.handle as string;

    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await signup(other, { name: "見た人" });
    await quickPost(other, "わたしの空", "", "red.jpg");

    await other.bringToFront();
    await open(other, `/p/${post.id}`);
    await other.getByTestId("like-button").click();
    await expect(other.getByTestId("like-count")).toHaveText("1");
    await other.getByTestId("bookmark-button").click();
    await expect(other.getByText("ブックマークに保存しました")).toBeVisible();
    await other.getByRole("textbox", { name: "コメントを書く" }).fill("すてきな一枚です");
    await other.getByRole("button", { name: "コメントを送信" }).click();
    await expect(other.getByTestId("comment-body")).toHaveText("すてきな一枚です");

    // ハッシュタグのページから辿れる
    await other.getByRole("link", { name: `#${tag}` }).click();
    await expect(other.getByRole("heading", { name: `#${tag}` })).toBeVisible();
    await expect(other.getByTestId("post-grid").locator("a")).toHaveCount(1);

    // ブックマーク一覧
    await open(other, "/bookmarks");
    await expect(other.getByTestId("post-grid").locator("a")).toHaveCount(1);

    // フォロー
    await open(other, `/u/${authorHandle}`);
    await other.getByTestId("follow-button").click();
    await expect(other.getByTestId("follow-button")).toHaveText("フォロー中");
    await expect(other.getByTestId("count-followers")).toHaveText("1");

    // 投稿した人にお知らせが届く
    await page.bringToFront();
    await open(page, "/");
    await expect(page.getByTestId("unread-badge")).toHaveText("3");
    await page.getByRole("link", { name: /お知らせ/ }).click();
    const list = page.getByTestId("notification-text");
    await expect(list).toHaveCount(3);
    await expect(page.getByTestId("notifications")).toContainText("見た人さんにフォローされました");
    await expect(page.getByTestId("notifications")).toContainText("見た人さんがコメントしました");
    await expect(page.getByTestId("notifications")).toContainText("見た人さんがあなたの投稿にいいねしました");
    await expect(page.getByTestId("unread-badge")).toHaveCount(0);
    expect(author.email).toBeTruthy();
    await ctx.close();
  });
});
