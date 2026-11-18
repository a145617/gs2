import { expect, test, type Page } from "@playwright/test";
import { open, signup } from "./helpers";

// デバッグモード（DEBUG_MODE=true の開発サーバーで確認する）

async function resetClock(page: Page) {
  const res = await page.request.post("/api/debug/clock", { data: { type: "reset" } });
  expect(res.status()).toBe(200);
}

test.describe("デバッグモード", () => {
  test("時計を次の朝5時の直前に進めると、ホームでお題が切り替わる様子を確認できる", async ({ page }) => {
    await signup(page, { name: "時計を進める人" });
    try {
      await open(page, "/debug");
      await page.getByTestId("clock-rollover").click();
      await expect(page.getByText("朝5時の30秒前に進めました")).toBeVisible();
      await expect(page.getByTestId("debug-app-time")).toContainText(/04:59:\d\d/);

      await open(page, "/");
      const title = page.getByTestId("today-theme").getByTestId("theme-title");
      await expect(title).not.toBeEmpty();
      const before = (await title.textContent())?.trim() ?? "";
      await expect(page.getByTestId("today-theme")).toContainText(/次のお題まで\s*0:00:[0-3]\d/);
      // 残り時間が0になると、次の日のお題に切り替わる
      await expect(title).not.toHaveText(before, { timeout: 60_000 });
    } finally {
      await resetClock(page);
    }
  });

  test("任意の内容・表示テンプレートのお題を今すぐ開始し、終わらせられる", async ({ page }) => {
    await signup(page, { name: "お題を出す人" });
    await open(page, "/debug");
    const title = `デバッグ${Date.now().toString(36).slice(-4)}`;
    await page.getByTestId("debug-theme-input").fill(title);
    await page.getByTestId("debug-theme-template").selectOption("water");
    await page.getByTestId("debug-theme-start").click();
    await expect(page.getByTestId("debug-theme-title")).toHaveText(`「${title}」`);
    const current = await (await page.request.get("/api/themes/current")).json();
    expect(current.theme).toMatchObject({ title, template: "water", source: "debug" });

    await open(page, "/");
    await expect(page.getByTestId("today-theme").getByTestId("theme-title")).toContainText(title);

    await open(page, "/debug");
    await page.getByTestId("debug-theme-end").click();
    await expect(page.getByTestId("debug-theme-title")).not.toHaveText(`「${title}」`);
  });

  test("ダミーデータを作ると、フィードにフォロー中の人の投稿が並び、テスト用ユーザーに切り替えて元に戻れる", async ({ page }) => {
    await signup(page, { name: "データを作る人" });
    await open(page, "/debug");
    await page.getByLabel("人数").selectOption("2");
    await page.getByLabel("1人あたりの投稿").selectOption("1");
    await page.getByTestId("debug-seed").click();
    await expect(page.getByText(/2人が今日のお題に2枚投稿し/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("debug-test-users")).not.toHaveText("0人");

    // フォロー中の人（テスト用ユーザー）の投稿が、フィードの上部に出る
    await open(page, "/");
    await expect(page.getByTestId("feed-section-following")).toBeVisible();

    // テスト用ユーザーに切り替える → 画面上部に帯が出る → 元に戻る
    await open(page, "/debug");
    const me = (await (await page.request.get("/api/me")).json()).user.displayName as string;
    await page.getByTestId("debug-user-list").getByTestId("debug-switch").first().click();
    await expect(page).toHaveURL(/\/$/);
    const banner = page.getByTestId("impersonation-banner");
    await expect(banner).toContainText("として操作中");
    await expect(banner).toContainText(me);
    const switched = (await (await page.request.get("/api/me")).json()) as { user: { displayName: string }; impersonator: { displayName: string } };
    expect(switched.user.displayName).toMatch(/^テスト・/);
    expect(switched.impersonator.displayName).toBe(me);

    await page.getByTestId("switch-back").click();
    await expect(page).toHaveURL(/\/debug$/);
    await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
    expect((await (await page.request.get("/api/me")).json()).user.displayName).toBe(me);

    // テスト用データをまとめて削除
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("debug-purge").click();
    await expect(page.getByText(/テスト用ユーザー\d+人と投稿\d+件を削除しました/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("debug-test-users")).toHaveText("0人");
  });

  test("イベントを今すぐ開始し、テスト用ユーザーの写真でマスを埋めて完成させられる", async ({ page }) => {
    await signup(page, { name: "イベントを確認する人" });
    await open(page, "/debug");
    await page.getByLabel("マス目の大きさ").selectOption("4");
    await page.getByTestId("debug-event-start").click();
    await expect(page.getByTestId("debug-event-status")).toHaveText("開催中（0/16マス）");
    await page.getByTestId("debug-event-fill").click();
    await expect(page.getByTestId("debug-event-status")).toHaveText("開催中（5/16マス）", { timeout: 60_000 });
    await page.getByTestId("debug-event-complete").click();
    await expect(page.getByText("すべてのマスが埋まり、絵が完成しました！")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("debug-event-status")).toHaveText("完成（16/16マス）");

    await open(page, "/event");
    await expect(page.getByTestId("event-status")).toHaveText("完成！");

    await open(page, "/debug");
    await page.getByTestId("debug-event-end").click();
    await expect(page.getByTestId("debug-event-none")).toBeVisible();
  });

  test("自己診断がすべて正常で、端末の対応状況・仕様の確認リスト・サンプルのRAWを確認できる", async ({ page }) => {
    await signup(page, { name: "診断する人" });
    await open(page, "/debug");
    await page.getByTestId("debug-selftest").click();
    const results = page.getByTestId("debug-selftest-results").locator("li");
    await expect(results.first()).toBeVisible({ timeout: 60_000 });
    const n = await results.count();
    expect(n).toBeGreaterThanOrEqual(10);
    await expect(results.filter({ hasText: "正常:" })).toHaveCount(n);

    await expect(page.getByTestId("debug-capabilities").locator("li")).not.toHaveCount(0);
    await expect(page.getByTestId("debug-device")).not.toHaveText("…");
    await expect(page.getByTestId("checklist-item")).toHaveCount(17);

    // 確認済みの印は、この端末に保存される
    const first = page.getByTestId("checklist-item").first().getByRole("checkbox");
    await first.check();
    await page.reload();
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await expect(page.getByTestId("checklist-item").first().getByRole("checkbox")).toBeChecked();

    const dng = await page.request.get("/api/debug/sample-dng");
    expect(dng.status()).toBe(200);
    expect(dng.headers()["content-type"]).toBe("image/x-adobe-dng");
    const body = await dng.body();
    expect(body.subarray(0, 4).toString("binary")).toBe("II*\u0000");
  });
});
