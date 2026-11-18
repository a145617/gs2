import { expect, test } from "@playwright/test";
import { open, signup } from "./helpers";

const KEYS = ["window", "gallery", "film", "water", "splash", "dark", "washi", "kaleido", "instant", "prism", "monitor", "fog"];

test.describe("お題ごとの表示テンプレート", () => {
  test("12種類のテンプレートがすべて表示できる", async ({ page }) => {
    await signup(page);
    await open(page, "/design/templates");
    for (const key of KEYS) {
      const stage = page.getByTestId(`template-${key}`).getByTestId("theme-stage");
      await expect(stage).toHaveAttribute("data-template", key);
      await stage.scrollIntoViewIfNeeded();
      await expect(stage.locator("img").first()).toBeVisible();
    }
  });

  test("今日のお題の投稿は、そのお題のテンプレートで表示される", async ({ page }) => {
    await signup(page);
    const theme = (await (await page.request.get("/api/themes/current")).json()).theme as { template: string };
    await open(page, "/camera");
    await page.getByTestId("library-input").setInputFiles(`${import.meta.dirname}/fixtures/photo.jpg`);
    await page.getByTestId("develop-next").click();
    await page.getByLabel("タイトル").fill("テンプレートの確認");
    await page.getByTestId("submit-post").click();
    await expect(page).toHaveURL(/\/p\//, { timeout: 30_000 });
    await expect(page.getByTestId("theme-stage")).toHaveAttribute("data-template", theme.template);
  });
});
