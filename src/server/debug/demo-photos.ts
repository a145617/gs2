import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../../../assets/demo-photos/photos.json";
import { deltaE2000, hexToLab } from "@/lib/color";
import { normalizeForSearch } from "@/lib/search";

// =============================================================================
// デバッグ・テスト用の写真素材（Unsplash の写真100枚、assets/demo-photos/）。
// ダミー投稿・イベントのマス・テスト用ユーザーのアイコン・サンプルのRAW・疑似カメラの映像は、すべてこの写真から作る。
// 写真ごとに「何が写っているか・どんな雰囲気か・何色か」のタグと代表色を持ち、
// お題に合う写真・指定の色に近い写真を選べる。
// =============================================================================

export type DemoPhoto = {
  /** Unsplash の写真ID */
  id: string;
  file: string;
  /** ダミー投稿のタイトル */
  title: string;
  /** 写っているもの・雰囲気・色・合うお題（日本語）。先頭の2つが主な被写体 */
  tags: string[];
  /** 主な色（日本語） */
  color: string;
  /** 代表色（#rrggbb） */
  hex: string;
  /** 撮影者（Unsplash での表示名） */
  by: string;
  /** Unsplash の写真のページ */
  url: string;
};

export const DEMO_PHOTOS: DemoPhoto[] = manifest as DemoPhoto[];

/** 決まった順に値を出す乱数（同じ種なら同じ結果になる） */
export function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * 写真がお題にどれだけ合うか（0 なら合わない）。
 * お題のタイトルに含まれるタグは重く、説明だけに含まれるタグは軽く数える。
 */
export function themeMatchScore(photo: Pick<DemoPhoto, "tags">, theme: { title: string; description?: string }): number {
  const title = normalizeForSearch(theme.title);
  const desc = normalizeForSearch(theme.description ?? "");
  let score = 0;
  for (const raw of photo.tags) {
    const tag = normalizeForSearch(raw);
    if (!tag) continue;
    if (tag === title) score += 4;
    else if (title.includes(tag)) score += 2;
    else if (desc.includes(tag)) score += 1;
  }
  return score;
}

/**
 * ダミー投稿に使う写真を count 枚選ぶ（同じ写真は使わない）。
 * お題に合う写真を先に（合うほど選ばれやすく）、足りない分はほかの写真からランダムに選ぶ。
 */
export function pickDemoPhotos(
  theme: { title: string; description?: string },
  count: number,
  random: () => number = Math.random,
): { photos: DemoPhoto[]; matched: number } {
  const scored = DEMO_PHOTOS.map((p) => ({ p, score: themeMatchScore(p, theme), r: random() }));
  // 合う写真: 点数に少しのゆらぎを足して並べる（毎回同じ写真ばかりにならないように）
  const matched = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score + b.r * 1.5 - (a.score + a.r * 1.5))
    .map((x) => x.p);
  const others = scored
    .filter((x) => x.score === 0)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.p);
  const n = Math.max(0, Math.min(count, DEMO_PHOTOS.length));
  const photos = [...matched, ...others].slice(0, n);
  return { photos, matched: Math.min(matched.length, n) };
}

/** 代表色が指定の色に近い順の写真 */
export function photosNearColor(hex: string): DemoPhoto[] {
  const target = hexToLab(hex);
  return DEMO_PHOTOS.map((p) => ({ p, d: deltaE2000(hexToLab(p.hex), target) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
}

/**
 * 指定の色に近い写真を1枚選ぶ（いちばん近い数枚の中からランダムに。同じ写真ばかり並ばないように）。
 * イベントのマスを埋める写真・疑似カメラの映像・テスト用の画像に使う。
 */
export function photoForColor(hex: string, random: () => number = Math.random, spread = 3): DemoPhoto {
  const near = photosNearColor(hex).slice(0, Math.max(1, spread));
  return near[Math.floor(random() * near.length) % near.length];
}

/** テスト用ユーザーのアイコンに使う写真（正方形に切り抜いても分かりやすいもの） */
export const AVATAR_PHOTO_IDS = [
  "uy5t-CJuIK4", // 布団の中の猫
  "5lRxNLHfZOY", // ひまわり一輪
  "TapDWPQUsQY", // 赤の中の一輪
  "YljyOLIE_N0", // 枝の桜
  "LdDewlTIn34", // 葉脈
  "swdRH05wYhA", // 大きなしゃぼん玉
  "1awGskRJlKs", // 草の上の猫
  "QhlWFtwBBlI", // ひとつの灯り
  "SGKQh9wNgAk", // たんぽぽの綿毛
  "UWidxu7nZNg", // ラテアート
  "8ZGgg6rhzxs", // 輪切りのオレンジ
  "SWAHvtC8S2E", // 芽吹き
  "3G6lrohVGR4", // ひとつだけの雲
  "IgDtMnJxYMg", // 空へ灯る
] as const;

export function demoPhotoById(id: string): DemoPhoto | null {
  return DEMO_PHOTOS.find((p) => p.id === id) ?? null;
}

/** テスト用ユーザーの n 番目のアイコンの写真 */
export function avatarPhoto(n: number): DemoPhoto {
  const id = AVATAR_PHOTO_IDS[((n % AVATAR_PHOTO_IDS.length) + AVATAR_PHOTO_IDS.length) % AVATAR_PHOTO_IDS.length];
  return demoPhotoById(id) ?? DEMO_PHOTOS[0];
}

/** 写真のファイルを読む（見つからなければ null） */
export async function loadDemoPhoto(photo: DemoPhoto): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "assets", "demo-photos", photo.file));
  } catch {
    return null;
  }
}

/** 写真のファイルを読む（見つからなければエラー。素材が無い環境では動かさない） */
export async function requireDemoPhoto(photo: DemoPhoto): Promise<Buffer> {
  const buf = await loadDemoPhoto(photo);
  if (!buf) throw new Error(`デバッグ用の写真（assets/demo-photos/${photo.file}）が見つかりません`);
  return buf;
}
