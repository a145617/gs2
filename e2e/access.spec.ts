import { expect, test } from "@playwright/test";
import { open, signup } from "./helpers";

// 合言葉（ACCESS_CODE）による入場制限。合言葉を設定したサーバーに対してだけ実行する:
//   ACCESS_CODE=合言葉 npx next start -p 3100
//   E2E_BASE_URL=http://localhost:3100 E2E_ACCESS_CODE=合言葉 npx playwright test e2e/access.spec.ts
const CODE = process.env.E2E_ACCESS_CODE ?? "";

test.describe("合言葉による入場制限（実験的な配布）", () => {
  test.skip(!CODE, "E2E_ACCESS_CODE が設定されていないため省略（合言葉を設定したサーバーで実行する）");

  test("合言葉を入力するまでは何も開けず、入力するといつものように登録・利用できる（デバッグモードも使える）", async ({ page }) => {
    // 合言葉の入力画面へ誘導される（開こうとしたページは覚えておく）
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/access\?next=%2Fexplore$/);
    await expect(page.getByRole("heading", { name: "合言葉を入力してください" })).toBeVisible();
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    // 違う合言葉は受け付けない
    await page.getByTestId("access-code").fill("ちがう合言葉");
    await page.getByTestId("access-submit").click();
    await expect(page.getByText("合言葉が違います")).toBeVisible();

    // 正しい合言葉（前後の空白は無視）で入れる → まだログインしていないのでログイン画面へ
    await page.getByTestId("access-code").fill(`  ${CODE} `);
    await page.getByTestId("access-submit").click();
    await expect(page).toHaveURL(/\/login\?next=%2Fexplore$/);

    // ここから先はいつもどおり
    await signup(page, { name: "招待された人" });
    await expect(page.getByTestId("today-theme")).toBeVisible();
    await open(page, "/debug");
    await expect(page.getByTestId("debug-page")).toBeVisible();
  });

  test("合言葉を入力していない端末からは、API・画像も使えない", async ({ browser }) => {
    const ctx = await browser.newContext({ ...test.info().project.use });
    const res = await ctx.request.get("/api/themes/current");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("access_code_required");
    expect((await ctx.request.get("/media/posts/x/sm.webp")).status()).toBe(401);
    expect((await ctx.request.get("/api/debug/status")).status()).toBe(401);
    // トップページも入力画面へ
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/access$/);
    await ctx.close();
  });
});
