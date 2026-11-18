import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";
import { open, signup } from "./helpers";

// 撮影に使う写真（Unsplash の写真、assets/demo-photos）
const STARRY_SKY = "Cq5NaI0yKBE"; // 満天の星（ほぼ黒）
const SUNFLOWER = "5lRxNLHfZOY"; // ひまわり一輪（黄・白）

async function photoJpeg(id: string) {
  const file = path.join(import.meta.dirname, "..", "assets", "demo-photos", `photo-${id}.webp`);
  return sharp(file).resize(900, 900, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
}

async function startEvent(page: Page, palette: { hex: string; name: string }[], size = 2) {
  const res = await page.request.post("/api/debug/events", {
    data: { palette, size, title: `テストの絵${Date.now().toString(36)}`, threshold: 0.3 },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).event as { id: string };
}

async function shootPhoto(page: Page, id: string) {
  await open(page, "/event/camera");
  await expect(page.getByTestId("event-color-chip")).toBeVisible();
  await page.getByTestId("library-input").setInputFiles({ name: `${id}.jpg`, mimeType: "image/jpeg", buffer: await photoJpeg(id) });
  await page.getByTestId("develop-next").click();
  await expect(page.getByRole("heading", { name: "投稿の内容" })).toBeVisible();
  await page.getByTestId("submit-post").click();
}

test.describe("イベント（色を集めてピクセルアートを完成させる）", () => {
  test("担当の色が割り当てられ、その色の写真で1マスが埋まり、全マスが埋まると完成する", async ({ page }) => {
    await signup(page, { name: "イベント参加者" });
    await startEvent(page, [{ hex: "#12131c", name: "夜の黒" }], 2);

    await open(page, "/event");
    await expect(page.getByTestId("event-view")).toBeVisible();
    await expect(page.getByTestId("my-color")).toContainText("夜の黒");
    await expect(page.getByTestId("event-progress")).toHaveText("0 / 4");
    await expect(page.getByTestId("mosaic")).toBeVisible();

    // 違う色の写真（ひまわり）は受け付けない
    await shootPhoto(page, SUNFLOWER);
    await expect(page.getByText(/「夜の黒」が足りません/)).toBeVisible();

    // 担当の色（黒）が多い写真（星空）なら1マス埋まる
    for (let i = 1; i <= 4; i++) {
      await shootPhoto(page, STARRY_SKY);
      await expect(page).toHaveURL(/\/event$/, { timeout: 30_000 });
      await expect(page.getByTestId("event-progress")).toHaveText(`${i} / 4`);
    }
    await expect(page.getByTestId("event-status")).toHaveText("完成！");
    await expect(page.getByTestId("event-completed")).toBeVisible();
  });

  test("参加者ごとに偏りなく色が割り当てられる", async ({ page, browser }) => {
    await signup(page, { name: "参加者1" });
    await startEvent(page, [
      { hex: "#d64545", name: "赤" },
      { hex: "#2f6fd6", name: "青" },
    ], 4);
    await open(page, "/event");
    const first = (await page.getByTestId("my-color").textContent()) ?? "";

    const ctx = await browser.newContext({ ...test.info().project.use });
    const other = await ctx.newPage();
    await signup(other, { name: "参加者2" });
    await open(other, "/event");
    const second = (await other.getByTestId("my-color").textContent()) ?? "";
    await ctx.close();
    const colorOf = (t: string) => (t.includes("赤") ? "赤" : t.includes("青") ? "青" : "?");
    expect(colorOf(first)).not.toBe("?");
    expect(colorOf(second)).not.toBe(colorOf(first));
  });
});
