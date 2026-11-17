import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { open, signup } from "./helpers";

async function quickPost(page: Page, title: string) {
  const theme = await (await page.request.get("/api/themes/current")).json();
  const buffer = await readFile(path.join(import.meta.dirname, "fixtures", "photo.jpg"));
  const res = await page.request.post("/api/posts", {
    multipart: {
      image: { name: "photo.jpg", mimeType: "image/jpeg", buffer },
      title,
      caption: "",
      tags: "",
      themeId: theme.theme.id,
      meta: JSON.stringify({ mode: "library" }),
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).post as { id: string; author: { handle: string } };
}

test.describe("ホームのフィード", () => {
  test("投稿するまでは今日の投稿がぼかされ、投稿するとフォロー中の人の投稿が上部に並ぶ", async ({ page, browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await signup(other, { name: "フォローされる人" });
    const theirs = await quickPost(other, `フォロー先の写真${Date.now()}`);
    await ctx.close();

    await page.bringToFront();
    await signup(page, { name: "フィードを見る人" });
    // フォローする
    await open(page, `/u/${theirs.author.handle}`);
    await page.getByTestId("follow-button").click();
    await expect(page.getByTestId("follow-button")).toHaveText("フォロー中");

    // まだ投稿していないので、フォロー先の今日の投稿はぼかされている
    await open(page, "/");
    const first = page.getByTestId("feed-item").first();
    await expect(page.getByTestId("feed-section-following")).toBeVisible();
    await expect(first).toHaveAttribute("data-post-id", theirs.id);
    await expect(first.getByTestId("locked-post")).toBeVisible();

    // 投稿すると見られるようになる
    await quickPost(page, "わたしの写真");
    await open(page, "/");
    const firstAfter = page.getByTestId("feed-item").first();
    await expect(firstAfter).toHaveAttribute("data-post-id", theirs.id);
    await expect(firstAfter).toHaveAttribute("data-section", "following");
    await expect(firstAfter.getByTestId("locked-post")).toHaveCount(0);
    await expect(firstAfter.getByRole("heading", { level: 3 })).toContainText("フォロー先の写真");

    // スクロールしてしばらく表示していると閲覧として記録される
    await firstAfter.getByRole("heading", { level: 3 }).scrollIntoViewIfNeeded();
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/posts/${theirs.id}`);
          return (await res.json()).post.counts.views as number;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
  });
});
