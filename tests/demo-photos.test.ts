import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DEMO_PHOTOS, loadDemoPhoto, pickDemoPhotos, seededRandom, themeMatchScore } from "@/server/debug/demo-photos";
import { DEFAULT_THEME_POOL } from "@/server/seed/theme-pool";

describe("デバッグ用のダミー投稿の写真（Unsplash の100枚）", () => {
  it("100枚そろっていて、ファイル・撮影者・写真のページ・タグがある", () => {
    expect(DEMO_PHOTOS).toHaveLength(100);
    expect(new Set(DEMO_PHOTOS.map((p) => p.id)).size).toBe(100);
    for (const p of DEMO_PHOTOS) {
      const file = path.join(process.cwd(), "assets", "demo-photos", p.file);
      expect(existsSync(file), p.file).toBe(true);
      expect(statSync(file).size).toBeLessThan(400 * 1024);
      expect(p.url).toBe(`https://unsplash.com/photos/${p.id}`);
      expect(p.by.length).toBeGreaterThan(0);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.tags.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("色と主題がばらついている（10色以上・どの色も2割以下、主な被写体は50種類以上）", () => {
    const colors = new Map<string, number>();
    for (const p of DEMO_PHOTOS) colors.set(p.color, (colors.get(p.color) ?? 0) + 1);
    expect(colors.size).toBeGreaterThanOrEqual(10);
    expect(Math.max(...colors.values())).toBeLessThanOrEqual(20);
    expect(new Set(DEMO_PHOTOS.map((p) => p.tags[0])).size).toBeGreaterThanOrEqual(50);
  });

  it("毎朝のお題の候補（62個）すべてに、合う写真が2枚以上ある", () => {
    const thin = DEFAULT_THEME_POOL.map((t) => ({ title: t.title, n: DEMO_PHOTOS.filter((p) => themeMatchScore(p, t) > 0).length })).filter(
      (x) => x.n < 2,
    );
    expect(thin).toEqual([]);
  });

  it("お題のタイトルに合う写真ほど点数が高い（タイトルそのもの > タイトルの一部 > 説明だけ）", () => {
    const photo = { tags: ["雨", "窓の外", "ガラス", "静けさ"] };
    expect(themeMatchScore(photo, { title: "雨" })).toBeGreaterThan(themeMatchScore(photo, { title: "雨の音" }));
    expect(themeMatchScore(photo, { title: "雨の音" })).toBeGreaterThan(themeMatchScore(photo, { title: "しずく", description: "雨の日に" }));
    expect(themeMatchScore(photo, { title: "しずく", description: "雨の日に" })).toBeGreaterThan(0);
    expect(themeMatchScore(photo, { title: "ごはん", description: "今日の一皿" })).toBe(0);
    // 全角・半角のゆれ、色の名前（「赤いもの」に「赤」が合う）
    expect(themeMatchScore({ tags: ["赤"] }, { title: "赤いもの" })).toBeGreaterThan(0);
  });

  it("お題に合う写真を優先して選び、足りない分はほかの写真で埋める（同じ写真は使わない）", () => {
    const random = seededRandom(42);
    const rain = pickDemoPhotos({ title: "雨", description: "濡れた街、しずく、雨の気配。" }, 3, random);
    expect(rain.photos).toHaveLength(3);
    expect(rain.matched).toBe(3);
    for (const p of rain.photos) expect(p.tags.some((t) => ["雨", "傘", "窓の外"].includes(t))).toBe(true);

    const red = pickDemoPhotos({ title: "赤いもの", description: "目に飛び込んでくる赤。" }, 24, random);
    expect(new Set(red.photos.map((p) => p.id)).size).toBe(24);
    expect(red.matched).toBeGreaterThan(5);
    expect(red.matched).toBeLessThan(24);
    // 合う写真が先に並ぶ
    for (const p of red.photos.slice(0, red.matched)) expect(themeMatchScore(p, { title: "赤いもの" })).toBeGreaterThan(0);

    // どの言葉にも合わないお題なら、ばらばらの写真を選ぶ
    const none = pickDemoPhotos({ title: "ζ" }, 10, random);
    expect(none.matched).toBe(0);
    expect(none.photos).toHaveLength(10);
    expect(new Set(none.photos.map((p) => p.color)).size).toBeGreaterThanOrEqual(3);

    // 枚数は写真の数まで
    expect(pickDemoPhotos({ title: "空" }, 500, random).photos).toHaveLength(100);
  });

  it("写真のファイルを読み込める（投稿の画像の処理に渡せる）", async () => {
    const buf = await loadDemoPhoto(DEMO_PHOTOS[0]);
    expect(buf).not.toBeNull();
    const meta = await sharp(buf!).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1280);
    expect(await loadDemoPhoto({ ...DEMO_PHOTOS[0], file: "missing.webp" })).toBeNull();
  });
});
