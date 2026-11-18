// 色の計算（クライアントとサーバーで共用）
// sRGB ⇔ CIE Lab 変換、色差 CIEDE2000、写真の色の特徴量

export type RGB = [number, number, number];
export type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

// sRGB(8bit) → 線形値のテーブル（高速化）
const LIN_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN_TABLE[i] = lin(i);

const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB(0-255) → CIE Lab（D65） */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = LIN_TABLE[r | 0];
  const G = LIN_TABLE[g | 0];
  const B = LIN_TABLE[b | 0];
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** 色差 CIEDE2000（0 = 同じ色。おおむね 2 以下で区別しにくい、10 を超えるとはっきり違う） */
export function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = C2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hpm = (h1p + h2p) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hpm - 30)) +
    0.24 * Math.cos(rad(2 * hpm)) +
    0.32 * Math.cos(rad(3 * hpm + 6)) -
    0.2 * Math.cos(rad(4 * hpm - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cpm, 7) / (Math.pow(Cpm, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lpm - 50, 2)) / Math.sqrt(20 + Math.pow(Lpm - 50, 2));
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/**
 * 画像（RGB/RGBA の画素列）のうち、目標の色に近い画素の割合（0〜1）。
 * イベントで「指定の色が画面内に多く含まれているか」の判定に使う。
 */
export function colorCoverage(
  pixels: ArrayLike<number>,
  channels: 3 | 4,
  targetHex: string,
  threshold = 20,
): number {
  const target = hexToLab(targetHex);
  const n = Math.floor(pixels.length / channels);
  if (n === 0) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const lab = rgbToLab(pixels[o], pixels[o + 1], pixels[o + 2]);
    if (deltaE2000(lab, target) <= threshold) hit++;
  }
  return hit / n;
}

export type ColorFeatures = {
  /** 代表色（多い順に最大3色） */
  dominant: string[];
  /** 色相のヒストグラム（12区分、彩度で重み付けして合計1に正規化） */
  hue: number[];
  /** 平均の明るさ（Lab の L, 0〜100） */
  lightness: number;
  /** 平均の鮮やかさ（Lab の彩度） */
  chroma: number;
};

/** 写真の色の特徴量（おすすめ表示の「好み」の計算などに使う） */
export function analyzeColors(pixels: ArrayLike<number>, channels: 3 | 4): ColorFeatures {
  const n = Math.floor(pixels.length / channels);
  const labs: Lab[] = new Array(n);
  const hue = new Array(12).fill(0);
  let sumL = 0;
  let sumC = 0;
  let hueTotal = 0;
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const lab = rgbToLab(pixels[o], pixels[o + 1], pixels[o + 2]);
    labs[i] = lab;
    const c = Math.hypot(lab[1], lab[2]);
    sumL += lab[0];
    sumC += c;
    if (c > 8) {
      // 区分の境目で値が大きく変わらないよう、隣の区分にも按分する
      const pos = ((deg(Math.atan2(lab[2], lab[1])) + 360) % 360) / 30 - 0.5;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      hue[(i0 + 12) % 12] += c * (1 - frac);
      hue[(i0 + 13) % 12] += c * frac;
      hueTotal += c;
    }
  }
  const hueNorm = hue.map((v) => (hueTotal > 0 ? Number((v / hueTotal).toFixed(4)) : 0));

  // k-means（k=4）で代表色を求める
  const k = Math.min(4, n);
  const centers: Lab[] = [];
  for (let i = 0; i < k; i++) centers.push([...labs[Math.floor(((i + 0.5) * n) / k)]] as Lab);
  const assign = new Int32Array(n);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (labs[i][0] - centers[c][0]) ** 2 + (labs[i][1] - centers[c][1]) ** 2 + (labs[i][2] - centers[c][2]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const a = acc[assign[i]];
      a[0] += labs[i][0];
      a[1] += labs[i][1];
      a[2] += labs[i][2];
      a[3]++;
    }
    for (let c = 0; c < k; c++) if (acc[c][3] > 0) centers[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
  }
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[assign[i]]++;
  const order = counts.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
  const dominant = order.slice(0, 3).map(([, i]) => rgbToHex(labToRgb(centers[i])));

  return {
    dominant,
    hue: hueNorm,
    lightness: n ? Number((sumL / n).toFixed(2)) : 0,
    chroma: n ? Number((sumC / n).toFixed(2)) : 0,
  };
}

/** CIE Lab → sRGB(0-255) */
export function labToRgb([L, a, b]: Lab): RGB {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const R = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const G = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const B = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  const enc = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return [enc(R), enc(G), enc(B)];
}

/** 2つの色特徴量の近さ（0〜1）。色相の分布のコサイン類似度＋明るさ・鮮やかさの近さ */
export function colorSimilarity(a: ColorFeatures, b: ColorFeatures): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += (a.hue[i] ?? 0) * (b.hue[i] ?? 0);
    na += (a.hue[i] ?? 0) ** 2;
    nb += (b.hue[i] ?? 0) ** 2;
  }
  const hueSim = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0.5;
  const lSim = 1 - Math.min(1, Math.abs(a.lightness - b.lightness) / 60);
  const cSim = 1 - Math.min(1, Math.abs(a.chroma - b.chroma) / 50);
  return hueSim * 0.6 + lSim * 0.25 + cSim * 0.15;
}
