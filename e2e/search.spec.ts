import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { open, signup } from "./helpers";

async function quickPost(page: Page, title: string, caption: string, tags: string) {
  const theme = await (await page.request.get("/api/themes/current")).json();
  const buffer = await readFile(path.join(import.meta.dirname, "fixtures", "photo.jpg"));
  const res = await page.request.post("/api/posts", {
    multipart: {
      image: { name: "photo.jpg", mimeType: "image/jpeg", buffer },
      title,
      caption,
      tags,
      themeId: theme.theme.id,
      meta: JSON.stringify({ mode: "library" }),
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).post as { id: string };
}

test.describe("検索", () => {
  test("タイトル・キャプション・ハッシュタグで投稿を検索できる", async ({ page }) => {
    const word = `検索語${Date.now().toString(36)}`;
    await signup(page, { name: "検索する人" });
    const byTitle = await quickPost(page, `${word}のタイトル`, "", "");
    const byCaption = await quickPost(page, "べつの写真", `本文に${word}を含む`, "");
    const byTag = await quickPost(page, "タグの写真", "", `${word}タグ`);

    await open(page, "/explore");
    await page.getByTestId("search-input").fill(word);
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(word)}`));
    const grid = page.getByTestId("post-grid");
    await expect(grid.locator("a")).toHaveCount(3);
    for (const p of [byTitle, byCaption, byTag]) {
      await expect(grid.locator(`a[href="/p/${p.id}"]`)).toHaveCount(1);
    }

    // ハッシュタグで絞り込む
    await page.getByTestId("search-input").fill(`#${word}タグ`);
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL(/q=%23/);
    await expect(page.getByTestId("post-grid").locator("a")).toHaveCount(1);
    await expect(page.getByTestId("post-grid").locator(`a[href="/p/${byTag.id}"]`)).toHaveCount(1);

    // タグのタブ
    await page.getByRole("tab", { name: "タグ" }).click();
    await expect(page.getByTestId("tag-results")).toContainText(`${word}タグ`);

    // ユーザーのタブ
    await page.getByTestId("search-input").fill("検索する人");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent("検索する人")}`));
    await page.getByRole("tab", { name: "ユーザー" }).click();
    await expect(page.getByTestId("user-list")).toContainText("検索する人");
  });
});
