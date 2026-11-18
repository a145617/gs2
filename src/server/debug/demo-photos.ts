import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../../../assets/demo-photos/photos.json";
import { normalizeForSearch } from "@/lib/search";

// =============================================================================
// デバッグ用のダミー投稿に使う写真（Unsplash の写真100枚、assets/demo-photos/）。
// 写真ごとに「何が写っているか・どんな雰囲気か・何色か」のタグを持ち、
// お題（タイトル・説明）に含まれる言葉と合う写真を優先して選ぶ。
// =============================================================================

export type DemoPhoto = {
  /** Unsplash の写真ID */
  id: string;
  file: string;
  /** ダミー投稿のタイトル */
  title: string;
  /** 写っているもの・雰囲気・色・合うお題（日本語）。先頭の2つが主な被写体 */
  tags: string[];
  /** 主な色 */
  color: string;
  /** 撮影者（Unsplash での表示名） */
  by: string;
  /** Unsplash の写真のページ */
  url: string;
};

export const DEMO_PHOTOS: DemoPhoto[] = manifest as DemoPhoto[];

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

/** 写真のファイルを読む（見つからなければ null。呼び出し側で描いた画像に切り替える） */
export async function loadDemoPhoto(photo: DemoPhoto): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "assets", "demo-photos", photo.file));
  } catch {
    return null;
  }
}
