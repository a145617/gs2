import { expect, test } from "@playwright/test";
import path from "node:path";
import { login, open, signup, uniqueEmail } from "./helpers";

test.describe("アカウント・ログイン", () => {
  test("未ログインで開くとログイン画面に誘導される", async ({ page }) => {
    await open(page, "/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  });

  test("新規登録 → ユーザーIDが自動で割り振られる → ログアウト → ログイン", async ({ page }) => {
    const { email, password } = await signup(page, { name: "写真好き" });

    await open(page, "/me");
    await expect(page.getByTestId("profile-name")).toHaveText("写真好き");
    await expect(page.getByTestId("profile-handle")).toHaveText(/^@[a-z2-9]{8}$/);

    await open(page, "/settings");
    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/login/);

    await login(page, email, password);
  });

  test("間違ったパスワードではログインできない", async ({ page }) => {
    const { email } = await signup(page);
    await page.context().clearCookies();
    await open(page, "/login");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByText("メールアドレスまたはパスワードが違います")).toBeVisible();
  });

  test("登録時の入力エラーが表示される", async ({ page }) => {
    await open(page, "/signup");
    await page.getByLabel("ユーザー名").fill("テスト");
    await page.getByLabel("メールアドレス").fill(uniqueEmail());
    await page.getByLabel("パスワード", { exact: true }).fill("short");
    await page.getByRole("button", { name: "登録してはじめる" }).click();
    await expect(page.getByText("パスワードは8文字以上にしてください")).toBeVisible();
  });

  test("ユーザー名・自己紹介・アイコンを変更できる", async ({ page }) => {
    await signup(page, { name: "変更前" });
    await open(page, "/settings");
    await page.getByLabel("ユーザー名").fill("変更後の名前");
    await page.getByLabel("自己紹介").fill("空の写真をよく撮ります");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("プロフィールを保存しました")).toBeVisible();

    await page.getByTestId("avatar-input").setInputFiles(path.join(import.meta.dirname, "fixtures", "photo.jpg"));
    await expect(page.getByRole("dialog", { name: "アイコンの切り抜き" })).toBeVisible();
    await page.getByRole("button", { name: "この範囲で保存" }).click();
    await expect(page.getByText("アイコンを変更しました")).toBeVisible();

    await open(page, "/me");
    await expect(page.getByTestId("profile-name")).toHaveText("変更後の名前");
    await expect(page.getByText("空の写真をよく撮ります")).toBeVisible();
    await expect(page.locator("img[src^='/media/avatars/']").first()).toBeVisible();
  });
});
