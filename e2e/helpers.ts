import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** ページを開き、画面の準備（ハイドレーション）が終わるまで待つ */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** 新規登録してログイン状態にする */
export async function signup(page: Page, opts: { name?: string; email?: string; password?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? "password-1234";
  const name = opts.name ?? "テスト太郎";
  await open(page, "/signup");
  await page.getByLabel("ユーザー名").fill(name);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登録してはじめる" }).click();
  await expect(page).toHaveURL(/\/$/);
  return { email, password, name };
}

export async function login(page: Page, email: string, password: string) {
  await open(page, "/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/$/);
}
