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

/** ホームのフィードに出てくる投稿（すべてのページ） */
async function feedIds(page: Page): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = "0";
  for (let i = 0; i < 50 && cursor; i++) {
    const res = await page.request.get(`/api/feed?seed=e2e&cursor=${cursor}`);
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { items: { id: string }[]; nextCursor: string | null };
    ids.push(...data.items.map((p) => p.id));
    cursor = data.nextCursor;
  }
  return ids;
}

test.describe("通報・ミュート", () => {
  test("ミュートすると、その人の投稿が表示されなくなり、設定から解除できる", async ({ page, browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await signup(other, { name: "ミュートされる人" });
    const theirs = await quickPost(other, `ミュート対象${Date.now()}`);

    await ctx.close();
    await page.bringToFront();
    await signup(page, { name: "ミュートする人" });
    await quickPost(page, "自分の投稿");
    await open(page, `/p/${theirs.id}`);
    await expect(page.getByTestId("post-title")).toBeVisible();

    await open(page, `/u/${theirs.author.handle}`);
    await page.getByRole("button", { name: "このユーザーのメニュー" }).click();
    await page.getByRole("button", { name: "ミュートされる人さんをミュート" }).click();
    await expect(page.getByTestId("muted-notice")).toBeVisible();

    // 今日のお題の投稿一覧（新しい順）にも、ホームのフィード（全ページ）にも出てこない
    const themeId = (await (await page.request.get("/api/themes/current")).json()).theme.id as string;
    await open(page, `/themes/${themeId}`);
    await expect(page.getByTestId("post-grid")).toBeVisible();
    await expect(page.locator(`a[href="/p/${theirs.id}"]`)).toHaveCount(0);
    expect(await feedIds(page)).not.toContain(theirs.id);

    // 設定から解除すると戻る
    await open(page, "/settings");
    const muted = page.getByTestId("muted-users");
    await expect(muted).toContainText("ミュートされる人");
    await muted.getByRole("button", { name: "解除" }).click();
    await expect(muted).toContainText("ミュートしているユーザーはいません");
    await open(page, `/themes/${themeId}`);
    await expect(page.locator(`a[href="/p/${theirs.id}"]`)).toHaveCount(1);
    expect(await feedIds(page)).toContain(theirs.id);
  });

  test("不適切な投稿を理由を選んで通報できる（二重には通報できない）", async ({ page, browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await signup(other, { name: "通報される人" });
    const theirs = await quickPost(other, "通報対象");

    await ctx.close();
    await page.bringToFront();
    await signup(page, { name: "通報する人" });
    await quickPost(page, "自分の投稿");
    await open(page, `/p/${theirs.id}`);
    await page.getByRole("button", { name: "この投稿のメニュー" }).click();
    await page.getByRole("button", { name: "通報する" }).click();
    const sheet = page.getByRole("dialog", { name: "この投稿を通報" });
    await expect(sheet.getByRole("button", { name: "通報する" })).toBeDisabled();
    await sheet.getByText("スパム・宣伝").click();
    await sheet.getByLabel("詳しい内容（任意）").fill("宣伝目的の投稿です");
    await sheet.getByRole("button", { name: "通報する" }).click();
    await expect(page.getByText("通報しました。ご協力ありがとうございます")).toBeVisible();

    await page.getByRole("button", { name: "この投稿のメニュー" }).click();
    await page.getByRole("button", { name: "通報する" }).click();
    await page.getByRole("dialog", { name: "この投稿を通報" }).getByText("その他").click();
    await page.getByRole("dialog", { name: "この投稿を通報" }).getByRole("button", { name: "通報する" }).click();
    await expect(page.getByText("すでに通報済みです")).toBeVisible();
  });
});
