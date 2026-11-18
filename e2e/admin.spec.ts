import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { login, open, signup } from "./helpers";

// 初期管理者（npm run seed で .env.local の ADMIN_EMAIL / ADMIN_PASSWORD から作られる）
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.ADMIN_PASSWORD ?? "change-me-please",
};

const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

async function quickPost(page: Page, title: string, caption = "") {
  const theme = await (await page.request.get("/api/themes/current")).json();
  const buffer = await readFile(path.join(import.meta.dirname, "fixtures", "photo.jpg"));
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
  return (await res.json()).post as { id: string; author: { handle: string } };
}

/** 別のブラウザ（別の人）を用意する */
async function another(browser: Browser, name: string) {
  const ctx = await browser.newContext({ ...test.info().project.use });
  const page = await ctx.newPage();
  const creds = await signup(page, { name });
  return { ctx, page, creds };
}

test.describe("管理者", () => {
  test("管理者以外は、管理画面も管理用のAPIも使えない", async ({ page }) => {
    await signup(page, { name: "一般の人" });
    await open(page, "/admin");
    await expect(page.getByText("管理者のみ利用できます")).toBeVisible();
    expect((await page.request.get("/api/admin/stats")).status()).toBe(403);
    expect((await page.request.post("/api/admin/themes", { data: { mode: "now", title: "乗っ取り", template: "window" } })).status()).toBe(403);
  });

  test("任意の投稿を編集・非表示・削除でき、投稿者にお知らせが届く", async ({ page, browser }) => {
    const author = await another(browser, "投稿した人");
    const title = `管理テスト${uid()}`;
    const post = await quickPost(author.page, title, "#元のタグ");

    await login(page, ADMIN.email, ADMIN.password);
    await open(page, `/p/${post.id}`);
    await expect(page.getByTestId("post-title")).toHaveText(title);

    // 編集
    await page.getByTestId("admin-post-menu").click();
    await page.getByTestId("admin-post-edit-open").click();
    const form = page.getByTestId("admin-post-edit");
    await form.getByLabel("タイトル").fill("管理者が直したタイトル");
    await form.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByTestId("post-title")).toHaveText("管理者が直したタイトル");
    await expect(page.getByText("管理者が編集しました")).toBeVisible();

    // 非表示 → 表示に戻す
    await page.getByTestId("admin-post-hide").click();
    await page.getByRole("button", { name: "非表示にする" }).click();
    await expect(page.getByTestId("admin-post-restore")).toBeVisible();
    await expect(page.getByText("この投稿は現在非表示です")).toBeVisible();
    expect((await author.page.request.get(`/api/posts/${post.id}`)).status()).toBe(200); // 本人には見える
    await page.getByTestId("admin-post-restore").click();
    await expect(page.getByTestId("admin-post-hide")).toBeVisible();

    // 削除（理由は投稿者に届く）
    await page.getByTestId("admin-post-delete").click();
    await page.getByLabel("削除の理由（投稿者に通知されます）").fill("テストのための削除です");
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page).not.toHaveURL(new RegExp(`/p/${post.id}`));
    expect((await author.page.request.get(`/api/posts/${post.id}`)).status()).toBe(404);

    await open(author.page, "/notifications");
    const texts = author.page.getByTestId("notification-text");
    await expect(texts.filter({ hasText: "管理者があなたの投稿を削除しました（テストのための削除です）" })).toHaveCount(1);
    await expect(texts.filter({ hasText: "管理者があなたの投稿を編集しました" })).toHaveCount(1);
    await author.ctx.close();
  });

  test("任意のコメントを編集・削除でき、通報を処理すると対象が非表示になり通報者にお知らせが届く", async ({ page, browser }) => {
    const a = await another(browser, "投稿者");
    const title = `通報テスト${uid()}`;
    const post = await quickPost(a.page, title);
    const b = await another(browser, "コメントと通報をする人");
    await quickPost(b.page, "自分の投稿"); // 今日のお題に投稿すると、ほかの人の投稿が見られる
    expect((await b.page.request.post(`/api/posts/${post.id}/comments`, { data: { body: "ひどいコメント" } })).status()).toBe(201);
    expect(
      (await b.page.request.post("/api/reports", { data: { targetType: "post", targetId: post.id, reason: "spam", detail: "宣伝です" } })).status(),
    ).toBe(201);

    await login(page, ADMIN.email, ADMIN.password);
    await open(page, `/p/${post.id}`);
    // コメントの編集
    await page.getByTestId("admin-comment-menu").click();
    await page.getByTestId("admin-comment-edit-open").click();
    await page.getByTestId("admin-comment-edit").getByLabel("コメント").fill("（管理者が修正しました）");
    await page.getByTestId("admin-comment-edit").getByRole("button", { name: "保存する" }).click();
    // 保存が終わるとメニューに戻る（下から出るシートは中身の高さが変わると閉じるボタンの位置も動くので、待ってから押す）
    await expect(page.getByTestId("admin-comment-panel")).toContainText("（管理者が修正しました）");
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByTestId("comment-body")).toHaveText("（管理者が修正しました）");
    // コメントの削除
    await page.getByTestId("admin-comment-menu").click();
    await page.getByTestId("admin-comment-delete").click();
    await page.getByLabel("削除の理由（書いた人に通知されます）").fill("不適切な表現");
    await page.getByRole("button", { name: "削除する" }).click();
    await expect(page.getByTestId("comment")).toHaveCount(0);

    // 通報の処理（非表示にする）
    await open(page, "/admin/reports");
    const card = page.getByTestId("admin-report").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("宣伝です");
    await card.getByTestId("report-hide").click();
    await page.getByRole("dialog").getByRole("button", { name: "非表示にする" }).click();
    await expect(page.getByTestId("admin-report").filter({ hasText: title })).toHaveCount(0);

    expect((await b.page.request.get(`/api/posts/${post.id}`)).status()).toBe(404);
    await open(b.page, "/notifications");
    await expect(b.page.getByTestId("notification-text").filter({ hasText: "あなたの通報が確認されました" })).toHaveCount(1);
    await expect(b.page.getByTestId("notification-text").filter({ hasText: "管理者があなたのコメントを削除しました（不適切な表現）" })).toHaveCount(1);
    await a.ctx.close();
    await b.ctx.close();
  });

  test("アカウントへの警告は本人が確認するまで表示され続け、アカウントを削除するとログインできなくなる", async ({ page, browser }) => {
    const target = await another(browser, `警告される人${uid()}`);

    await login(page, ADMIN.email, ADMIN.password);
    await open(page, "/admin/users");
    await page.getByRole("searchbox").fill(target.creds.email);
    await page.getByRole("searchbox").press("Enter");
    const row = page.getByTestId("admin-user-row").filter({ hasText: target.creds.name });
    await expect(row).toHaveCount(1);
    await row.click();
    await page.getByTestId("admin-user-warn").click();
    await page.getByLabel("警告の内容（本人に表示されます）").fill("ほかの人を傷つけるコメントはやめてください");
    await page.getByRole("button", { name: "警告を送る" }).click();
    await expect(page.getByTestId("admin-user-panel")).toContainText("警告 1");

    // 本人の画面に、閉じられない警告が出る
    await open(target.page, "/");
    await expect(target.page.getByTestId("warning-gate")).toBeVisible();
    await expect(target.page.getByTestId("warning-message")).toHaveText("ほかの人を傷つけるコメントはやめてください");
    await expect(target.page.getByRole("button", { name: "閉じる" })).toHaveCount(0);
    await target.page.getByTestId("warning-ack").click();
    await expect(target.page.getByTestId("warning-gate")).toHaveCount(0);
    await open(target.page, "/");
    await expect(target.page.getByTestId("today-theme")).toBeVisible();
    await expect(target.page.getByTestId("warning-gate")).toHaveCount(0);

    // アカウントの削除
    await page.getByTestId("admin-user-delete").click();
    await page.getByLabel("削除の理由（操作の記録に残ります）").fill("規約違反が続いたため");
    await page.getByRole("button", { name: "アカウントを削除する" }).click();
    await expect(page.getByTestId("admin-user-row").filter({ hasText: target.creds.name })).toHaveCount(0);

    expect((await target.page.request.get("/api/me")).status()).toBe(401);
    const relogin = await target.page.request.post("/api/auth/login", {
      data: { email: target.creds.email, password: target.creds.password },
    });
    expect(relogin.status()).toBe(401);

    // 操作の記録に残る
    await open(page, "/admin/audit");
    await expect(page.getByTestId("audit-row").first()).toContainText("アカウントを削除");
    await target.ctx.close();
  });

  test("任意のタイミング・内容で、お題とイベントを開催・終了できる", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    // お題を今すぐ開始
    const theme = `E2Eお題${uid()}`.slice(0, 20);
    await open(page, "/admin/themes");
    const create = page.getByTestId("theme-create");
    await create.getByTestId("theme-title").fill(theme);
    await create.getByTestId("theme-template").selectOption("prism");
    await create.getByTestId("theme-submit").click();
    await expect(page.getByTestId("admin-current-theme-title")).toHaveText(`「${theme}」`);
    await open(page, "/");
    await expect(page.getByTestId("today-theme").getByTestId("theme-title")).toContainText(theme);
    const current = await (await page.request.get("/api/themes/current")).json();
    expect(current.theme).toMatchObject({ title: theme, template: "prism", source: "admin" });

    // 今すぐ終了すると、いつものお題に戻る
    await open(page, "/admin/themes");
    await page.getByTestId("theme-end").click();
    await page.getByRole("button", { name: "今すぐ終了する" }).click();
    await expect(page.getByTestId("admin-current-theme-title")).not.toHaveText(`「${theme}」`);

    // 日時を指定して予約し、取り消す
    const scheduled = `予約${uid()}`.slice(0, 20);
    await create.getByTestId("theme-title").fill(scheduled);
    await create.getByRole("tab", { name: "日時を指定" }).click();
    await expect(create.getByTestId("theme-starts")).not.toHaveValue("");
    await create.getByTestId("theme-submit").click();
    const upcoming = page.getByTestId("admin-upcoming-themes").getByTestId("admin-theme-row").filter({ hasText: scheduled });
    await expect(upcoming).toHaveCount(1);
    await upcoming.getByRole("button", { name: "取り消す" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取り消す" }).click();
    await expect(page.getByTestId("admin-theme-row").filter({ hasText: scheduled })).toHaveCount(0);

    // イベントを今すぐ開催
    const eventTitle = `E2Eイベント${uid()}`.slice(0, 40);
    await open(page, "/admin/events");
    const form = page.getByTestId("event-create");
    await form.getByRole("radio", { name: /夜の灯台/ }).click();
    await form.getByTestId("event-title").fill(eventTitle);
    await form.getByTestId("event-submit").click();
    const live = page.getByTestId("admin-live-events").getByTestId("admin-event-row").filter({ hasText: eventTitle });
    await expect(live).toContainText("開催中");
    await open(page, "/event");
    await expect(page.getByTestId("event-view")).toContainText(eventTitle);

    // 今すぐ終了
    await open(page, "/admin/events");
    await page.getByTestId("admin-event-row").filter({ hasText: eventTitle }).getByTestId("event-end").click();
    await page.getByRole("button", { name: "今すぐ終了する" }).click();
    await expect(page.getByTestId("admin-live-events").getByTestId("admin-event-row").filter({ hasText: eventTitle })).toHaveCount(0);
  });
});
