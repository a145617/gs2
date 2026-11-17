import { deltaE2000, hexToLab, labToRgb, rgbToHex, rgbToLab, type Lab } from "./color";

// =============================================================================
// イベントで完成させる「ピクセルアート」（クライアントとサーバーで共用）
// プリセットは図形の組み合わせで描くので、どの大きさ（マス目の数）でも作れる。
// =============================================================================

export type PaletteColor = { hex: string; name: string };
export type PixelArt = { w: number; h: number; palette: PaletteColor[]; cells: number[] };

type Painter = (x: number, y: number) => number; // 0〜1 の座標 → パレットの番号

function render(w: number, h: number, palette: PaletteColor[], paint: Painter): PixelArt {
  const cells: number[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) cells.push(paint((i + 0.5) / w, (j + 0.5) / h));
  }
  // 使われなかった色はパレットから外す
  const used = Array.from(new Set(cells)).sort((a, b) => a - b);
  const remap = new Map(used.map((c, k) => [c, k]));
  return { w, h, palette: used.map((c) => palette[c]), cells: cells.map((c) => remap.get(c)!) };
}

const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export const PRESETS: Record<string, { name: string; description: string; build: (w: number, h: number) => PixelArt }> = {
  sunrise: {
    name: "朝焼けの山",
    description: "夜明けの空に、雪をかぶった山と朝日",
    build: (w, h) =>
      render(
        w,
        h,
        [
          { hex: "#1f2a5a", name: "夜明けの紺" },
          { hex: "#6fa8dc", name: "空の青" },
          { hex: "#f08a3c", name: "朝焼けの橙" },
          { hex: "#ffd23f", name: "朝日の黄" },
          { hex: "#5b5370", name: "山の灰紫" },
          { hex: "#f5f5f5", name: "雪の白" },
          { hex: "#3f7d4a", name: "森の緑" },
        ],
        (x, y) => {
          if (y > 0.82) return 6;
          const peak = 0.36;
          const mountain = y > peak + Math.abs(x - 0.52) * 1.15;
          if (mountain) return y < peak + 0.11 + Math.abs(x - 0.52) * 0.15 ? 5 : 4;
          if (inCircle(x, y, 0.8, 0.5, 0.11)) return 3;
          if (y < 0.22) return 0;
          if (y < 0.45) return 1;
          return 2;
        },
      ),
  },
  lighthouse: {
    name: "夜の灯台",
    description: "星空の下、海を照らす灯台",
    build: (w, h) =>
      render(
        w,
        h,
        [
          { hex: "#12131c", name: "夜の黒" },
          { hex: "#233063", name: "夜空の紺" },
          { hex: "#f4f1e8", name: "星と灯台の白" },
          { hex: "#ffd54a", name: "月と灯りの黄" },
          { hex: "#2f6fb5", name: "海の青" },
          { hex: "#d64545", name: "灯台の赤" },
        ],
        (x, y) => {
          if (inCircle(x, y, 0.2, 0.17, 0.08) && !inCircle(x, y, 0.24, 0.15, 0.07)) return 3;
          const tower = x > 0.58 && x < 0.74 && y > 0.32 && y < 0.8;
          if (tower) return Math.floor((y - 0.32) / 0.12) % 2 === 0 ? 2 : 5;
          if (x > 0.55 && x < 0.77 && y > 0.25 && y <= 0.32) return 3; // 灯り
          if (y > 0.24 && y < 0.34 && x < 0.58 && Math.abs(y - 0.29) < (0.58 - x) * 0.18) return 3; // 光の帯
          if (y >= 0.8) return 4;
          const star = (Math.sin(x * 91.7 + y * 43.3) * 43758.5453) % 1;
          if (y < 0.7 && Math.abs(star) > 0.93) return 2;
          return y < 0.45 ? 0 : 1;
        },
      ),
  },
  goldfish: {
    name: "金魚",
    description: "水の中をおよぐ金魚と水草",
    build: (w, h) =>
      render(
        w,
        h,
        [
          { hex: "#bfe3f5", name: "水の水色" },
          { hex: "#f26b3a", name: "金魚の朱" },
          { hex: "#c8302c", name: "ひれの赤" },
          { hex: "#3f9b5a", name: "水草の緑" },
          { hex: "#ffffff", name: "泡の白" },
          { hex: "#1d2a3a", name: "目の黒" },
        ],
        (x, y) => {
          if (inCircle(x, y, 0.36, 0.44, 0.025)) return 5;
          if (inEllipse(x, y, 0.45, 0.47, 0.2, 0.13)) return 1;
          // 尾びれ
          if (x > 0.62 && x < 0.86 && Math.abs(y - 0.47) < (x - 0.6) * 0.9) return 2;
          if (inEllipse(x, y, 0.47, 0.62, 0.07, 0.05)) return 2;
          const weed = (cx: number) => Math.abs(x - (cx + Math.sin(y * 14) * 0.03)) < 0.035 && y > 0.55;
          if (weed(0.16) || weed(0.84)) return 3;
          if (inCircle(x, y, 0.3, 0.24, 0.03) || inCircle(x, y, 0.24, 0.14, 0.022) || inCircle(x, y, 0.34, 0.07, 0.016)) return 4;
          return 0;
        },
      ),
  },
  umbrella: {
    name: "雨の日の傘",
    description: "雨の中にひらく赤い傘",
    build: (w, h) =>
      render(
        w,
        h,
        [
          { hex: "#8e97a6", name: "雨空の灰" },
          { hex: "#c9d6e6", name: "雨の水色" },
          { hex: "#d64545", name: "傘の赤" },
          { hex: "#4a3a30", name: "柄の茶" },
          { hex: "#3b4250", name: "地面の墨" },
          { hex: "#6f90b8", name: "水たまりの青" },
        ],
        (x, y) => {
          if (y > 0.84) return inEllipse(x, y, 0.5, 0.91, 0.28, 0.04) ? 5 : 4;
          const top = 0.28;
          if (y > top && y < 0.5 && inEllipse(x, y, 0.5, 0.5, 0.32, 0.22) && y < 0.5) return 2;
          if (Math.abs(x - 0.5) < 0.018 && y >= 0.5 && y < 0.78) return 3;
          if (y >= 0.74 && y < 0.8 && x > 0.5 && x < 0.58 && (y > 0.77 || x > 0.555)) return 3;
          const rain = ((x * 37 + y * 11) % 0.2) < 0.012;
          return rain ? 1 : 0;
        },
      ),
  },
  flower: {
    name: "一輪の花",
    description: "鉢に咲いた一輪の花",
    build: (w, h) =>
      render(
        w,
        h,
        [
          { hex: "#f3ead8", name: "壁の生成り" },
          { hex: "#f08ab0", name: "花びらの桃" },
          { hex: "#ffd23f", name: "花芯の黄" },
          { hex: "#3f9b5a", name: "葉の緑" },
          { hex: "#a0603a", name: "鉢の茶" },
        ],
        (x, y) => {
          if (inCircle(x, y, 0.5, 0.3, 0.07)) return 2;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            if (inCircle(x, y, 0.5 + Math.cos(a) * 0.12, 0.3 + Math.sin(a) * 0.12, 0.085)) return 1;
          }
          if (Math.abs(x - 0.5) < 0.02 && y > 0.36 && y < 0.72) return 3;
          if (inEllipse(x, y, 0.38, 0.56, 0.1, 0.04) || inEllipse(x, y, 0.62, 0.5, 0.1, 0.04)) return 3;
          if (y > 0.7 && y < 0.92 && Math.abs(x - 0.5) < 0.2 - (y - 0.7) * 0.3) return 4;
          return 0;
        },
      ),
  },
};

export const PRESET_KEYS = Object.keys(PRESETS);

// ------------------------------------------------------------------ 色の名前
const NAMED: { hex: string; name: string }[] = [
  { hex: "#000000", name: "黒" },
  { hex: "#3b3b3b", name: "墨" },
  { hex: "#8c8c8c", name: "灰" },
  { hex: "#ffffff", name: "白" },
  { hex: "#d63a3a", name: "赤" },
  { hex: "#f08a3c", name: "橙" },
  { hex: "#ffd23f", name: "黄" },
  { hex: "#9cc84a", name: "黄緑" },
  { hex: "#3f9b5a", name: "緑" },
  { hex: "#4fb0c9", name: "水色" },
  { hex: "#2f6fd6", name: "青" },
  { hex: "#1f2a5a", name: "紺" },
  { hex: "#8a5cc7", name: "紫" },
  { hex: "#f08ab0", name: "桃" },
  { hex: "#8a5a3a", name: "茶" },
  { hex: "#e8d8b8", name: "生成り" },
];

/** 色にいちばん近い色名（例: 赤・紺・桃） */
export function nameColor(hex: string): string {
  const lab = hexToLab(hex);
  let best = NAMED[0];
  let bd = Infinity;
  for (const c of NAMED) {
    const d = deltaE2000(lab, hexToLab(c.hex));
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best.name;
}

/**
 * 画像の画素（RGB）から、w×h のピクセルアートを作る（k-means で k 色に減色）。
 * 管理者がアップロードした画像をイベントの絵にするときに使う。
 */
export function pixelize(rgb: ArrayLike<number>, w: number, h: number, k: number): PixelArt {
  const n = w * h;
  const labs: Lab[] = [];
  for (let i = 0; i < n; i++) labs.push(rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
  // 初期値: 明るさ順に並べて等間隔に選ぶ
  const sorted = [...labs].sort((a, b) => a[0] - b[0]);
  let centers: Lab[] = Array.from({ length: k }, (_, j) => [...sorted[Math.floor(((j + 0.5) * n) / k)]] as Lab);
  const assign = new Int32Array(n);
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (labs[i][0] - centers[c][0]) ** 2 + (labs[i][1] - centers[c][1]) ** 2 + (labs[i][2] - centers[c][2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[i] = bi;
    }
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const a = acc[assign[i]];
      a[0] += labs[i][0];
      a[1] += labs[i][1];
      a[2] += labs[i][2];
      a[3]++;
    }
    centers = centers.map((c, j) => (acc[j][3] ? ([acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] as Lab) : c));
  }
  const hexes = centers.map((c) => rgbToHex(labToRgb(c)));
  const palette = hexes.map((hex) => ({ hex, name: nameColor(hex) }));
  // 同じ色名が重なる場合は番号を付けて区別する
  const seen = new Map<string, number>();
  for (const p of palette) {
    const k2 = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, k2);
    if (k2 > 1) p.name = `${p.name}${k2}`;
  }
  const art = { w, h, palette, cells: Array.from(assign) };
  // 使われなかった色を除く
  const used = Array.from(new Set(art.cells)).sort((a, b) => a - b);
  const remap = new Map(used.map((c, i) => [c, i]));
  return { w, h, palette: used.map((c) => palette[c]), cells: art.cells.map((c) => remap.get(c)!) };
}
