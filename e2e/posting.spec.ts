import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { open, signup } from "./helpers";

const fixture = (name: string) => path.join(import.meta.dirname, "fixtures", name);

/** デバッグモードの疑似カメラを使う（カメラの無い環境でも撮影の流れを確認できる） */
async function useFakeCamera(page: Page, mode: "fake" | "fake-manual") {
  await page.addInitScript((m) => localStorage.setItem("hk:debugCamera", m), mode);
}

/**
 * Windows 版の WebKit（テスト用ブラウザ）にはカメラ関連のAPIが無いため、疑似カメラを使う確認はできない。
 * 実機の iPhone の Safari にはあるので、その確認は実機で行う。
 */
async function skipIfNoCameraApi(page: Page) {
  await page.goto("/login");
  const ok = await page.evaluate(() => typeof HTMLCanvasElement.prototype.captureStream === "function");
  test.skip(!ok, "このテスト用ブラウザにはカメラ（MediaStream）のAPIがありません（実機で確認）");
}

async function fillDetailsAndPost(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: "投稿の内容" })).toBeVisible();
  await page.getByLabel("タイトル").fill(title);
  await page.getByLabel("キャプション").fill("いつもの帰り道で #夕焼け");
  await page.getByRole("textbox", { name: "ハッシュタグ" }).fill("空 散歩");
  await page.getByTestId("submit-post").click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByTestId("post-title")).toHaveText(title);
}

test.describe("撮影・投稿", () => {
  test("手動設定に対応した端末: シャッタースピード・ISOを設定して撮影し、現像して投稿できる", async ({ page }) => {
    await skipIfNoCameraApi(page);
    await useFakeCamera(page, "fake-manual");
    await signup(page);
    await open(page, "/camera");
    const panel = page.getByTestId("capability-panel");
    await expect(panel).toContainText("シャッタースピード");
    await expect(panel.getByText("手動で設定できます")).toHaveCount(2);
    await expect(panel).toContainText("絞り（F値）");
    await expect(panel).toContainText("この端末・ブラウザでは自動");

    await page.getByRole("radio", { name: "マニュアル" }).click();
    const shutter = page.getByRole("slider").first();
    await expect(shutter).toBeVisible();
    await shutter.focus();
    await page.keyboard.press("ArrowRight");
    await page.getByTestId("shutter").click();

    await expect(page.getByRole("heading", { name: "現像" })).toBeVisible();
    await expect(page.getByText("マニュアル撮影")).toBeVisible();
    await page.getByRole("slider", { name: "露出" }).fill("0.5");
    await page.getByTestId("develop-next").click();

    await fillDetailsAndPost(page, "マニュアルの空");
    await expect(page.getByTestId("post-meta")).toContainText("マニュアル撮影");
    await expect(page.getByTestId("post-meta")).toContainText("ISO");
    await expect(page.getByRole("link", { name: "#夕焼け" })).toBeVisible();
    await expect(page.getByRole("link", { name: "空", exact: true })).toBeVisible();
    await expect(page.getByTestId("post-image")).toBeVisible();
  });

  test("手動設定に対応していない端末: そのことが撮影画面に表示され、通常の撮影になる", async ({ page }) => {
    await skipIfNoCameraApi(page);
    await useFakeCamera(page, "fake");
    await signup(page);
    await open(page, "/camera");
    await expect(page.getByText("手動設定に対応していないため、通常の撮影（オート）になります")).toBeVisible();
    await expect(page.getByRole("radio", { name: "マニュアル" })).toHaveCount(0);
    await page.getByTestId("shutter").click();
    await expect(page.getByText("オート撮影")).toBeVisible();
    await page.getByTestId("develop-next").click();
    await fillDetailsAndPost(page, "オートの一枚");
  });

  test("ライブラリの写真を選んで投稿できる", async ({ page }) => {
    await useFakeCamera(page, "fake");
    await signup(page);
    await open(page, "/camera");
    await page.getByTestId("library-input").setInputFiles(fixture("photo.jpg"));
    await expect(page.getByRole("heading", { name: "現像" })).toBeVisible();
    await page.getByRole("tab", { name: "切り抜き" }).click();
    await page.getByRole("button", { name: "1:1" }).click();
    await page.getByTestId("develop-next").click();
    await fillDetailsAndPost(page, "ライブラリから");
    const img = page.getByTestId("post-image");
    await expect(img).toHaveAttribute("width", /\d+/);
    expect(await img.getAttribute("width")).toBe(await img.getAttribute("height"));
  });

  test("RAW（DNG）を取り込み、ブラウザで現像して投稿できる", async ({ page }) => {
    await useFakeCamera(page, "fake");
    await signup(page);
    await open(page, "/camera");
    await page.getByTestId("raw-input").setInputFiles(fixture("sample.dng"));
    await expect(page.getByRole("heading", { name: "RAW現像" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1\/125/)).toBeVisible();
    await expect(page.getByText(/f\/2\.8/)).toBeVisible();
    await page.getByRole("slider", { name: "露出" }).fill("1");
    await page.getByTestId("develop-next").click();
    await fillDetailsAndPost(page, "RAWから現像");
    await expect(page.getByTestId("post-meta")).toContainText("RAW現像");
    await expect(page.getByTestId("post-meta")).toContainText("1/125");
  });

  test("投稿するまで、ほかの人の今日の投稿はぼかされ、投稿すると見られる", async ({ page, browser }) => {
    await useFakeCamera(page, "fake");
    await signup(page, { name: "先に投稿した人" });
    await open(page, "/camera");
    await page.getByTestId("library-input").setInputFiles(fixture("photo.jpg"));
    await page.getByTestId("develop-next").click();
    await fillDetailsAndPost(page, "先に投稿した写真");
    const postUrl = page.url();

    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await other.addInitScript(() => localStorage.setItem("hk:debugCamera", "fake"));
    await signup(other, { name: "あとから見る人" });
    await other.goto(postUrl);
    await expect(other.getByTestId("locked-post")).toBeVisible();
    await expect(other.getByText("今日のお題に投稿すると見られます")).toBeVisible();
    await expect(other.getByTestId("post-title")).toHaveCount(0);

    await open(other, "/camera");
    await other.getByTestId("library-input").setInputFiles(fixture("red.jpg"));
    await other.getByTestId("develop-next").click();
    await fillDetailsAndPost(other, "あとからの写真");

    await other.goto(postUrl);
    await expect(other.getByTestId("post-title")).toHaveText("先に投稿した写真");
    await expect(other.getByTestId("locked-post")).toHaveCount(0);
    await ctx.close();
  });
});
