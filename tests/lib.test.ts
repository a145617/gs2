import { describe, expect, it } from "vitest";
import { collectTags, extractTags, normalizeTag, splitCaption } from "@/lib/hashtags";
import { colorCoverage, deltaE2000, hexToLab, rgbToHex, labToRgb, colorSimilarity, analyzeColors } from "@/lib/color";
import { formatPhotoMeta, formatShutter } from "@/lib/photo-meta";

describe("ハッシュタグ（日本語対応）", () => {
  it("キャプション中の #タグ を取り出し、正規化する", () => {
    expect(extractTags("夕方の #空 と #ＳＫＹ と #夕焼け_2026")).toEqual(["空", "sky", "夕焼け_2026"]);
    expect(normalizeTag("＃Tokyo")).toBe("tokyo");
  });

  it("入力欄とキャプションのタグをまとめ、重複を除いて最大10個", () => {
    const tags = collectTags("空 夕焼け, 空 #散歩", "今日は #空 がきれい");
    expect(tags).toEqual(["空", "夕焼け", "散歩"]);
    expect(collectTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });

  it("記号だけのタグは無視する", () => {
    expect(collectTags("!!! ??? #")).toEqual([]);
  });

  it("表示用にキャプションを本文とタグに分割する", () => {
    expect(splitCaption("見上げた #空 です")).toEqual([
      { type: "text", value: "見上げた " },
      { type: "tag", value: "空" },
      { type: "text", value: " です" },
    ]);
  });
});

describe("色の計算", () => {
  it("CIEDE2000 の既知の値（Sharma らのテストデータ）", () => {
    // Sharma, Wu, Dalal (2005) のペア1: ΔE00 = 2.0425
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    // ペア7: ΔE00 = 2.3669
    expect(deltaE2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 3);
  });

  it("Lab ⇔ RGB の往復", () => {
    for (const hex of ["#d64545", "#2f6fd6", "#ffffff", "#000000", "#7a9a8a"]) {
      expect(rgbToHex(labToRgb(hexToLab(hex)))).toBe(hex);
    }
  });

  it("指定色が画面に占める割合（イベントの判定）", () => {
    const red = [214, 69, 69];
    const blue = [47, 111, 214];
    const px = [...red, ...red, ...red, ...blue];
    expect(colorCoverage(px, 3, "#d64545")).toBeCloseTo(0.75);
    expect(colorCoverage(px, 3, "#2f6fd6")).toBeCloseTo(0.25);
    expect(colorCoverage(px, 3, "#00ff00")).toBe(0);
  });

  it("写真の色の特徴量と、似た色合いほど類似度が高い", () => {
    const reds = analyzeColors(new Array(300).fill(0).flatMap(() => [210, 60, 60]), 3);
    const reds2 = analyzeColors(new Array(300).fill(0).flatMap(() => [190, 50, 70]), 3);
    const blues = analyzeColors(new Array(300).fill(0).flatMap(() => [40, 90, 210]), 3);
    expect(reds.dominant[0]).toMatch(/^#/);
    expect(colorSimilarity(reds, reds2)).toBeGreaterThan(colorSimilarity(reds, blues));
  });
});

describe("撮影情報の表示", () => {
  it("シャッタースピード・ISO・絞り", () => {
    expect(formatShutter(1 / 250)).toBe("1/250");
    expect(formatShutter(2)).toBe("2s");
    expect(formatPhotoMeta({ mode: "manual", exposureTime: 1 / 60, iso: 400, fNumber: 1.8, focalLength: 26 })).toEqual([
      "1/60",
      "ISO 400",
      "f/1.8",
      "26mm",
    ]);
  });
});
