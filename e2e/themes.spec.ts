import { expect, test } from "@playwright/test";
import { open, signup } from "./helpers";

test.describe("毎朝5時のお題", () => {
  test("ホームに今日のお題と、次のお題までの残り時間が表示される", async ({ page }) => {
    await signup(page);
    const card = page.getByTestId("today-theme");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("theme-title")).not.toBeEmpty();
    await expect(card).toContainText("のお題");
    await expect(card).toContainText(/次のお題まで\s*\d+:\d{2}:\d{2}/);
    await expect(card.getByRole("link", { name: "このお題で撮る" })).toHaveAttribute("href", "/camera");
  });

  test("これまでのお題の一覧から、お題のページを開ける", async ({ page }) => {
    await signup(page);
    const title = (await page.getByTestId("theme-title").textContent())?.trim() ?? "";
    await open(page, "/explore");
    const archive = page.getByTestId("theme-archive");
    await expect(archive).toContainText(title);
    await expect(archive).toContainText("開催中");
    // 開催中のお題が一番上に出る
    await expect(archive.getByRole("link").first()).toContainText(title);
    await archive.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/themes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: `「${title}」` })).toBeVisible();
  });
});
