// ハッシュタグ（日本語対応）

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** タグを正規化する（全角英数→半角、小文字化、先頭の # を除去） */
export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/^[#＃]+/, "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

const TAG_CHARS = "\\p{L}\\p{N}\\p{M}_ー〜・";
const TAG_IN_TEXT = new RegExp(`[#＃]([${TAG_CHARS}]+)`, "gu");
const VALID = new RegExp(`^[${TAG_CHARS}]+$`, "u");

export function isValidTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= MAX_TAG_LENGTH && VALID.test(tag);
}

/** キャプション中の #タグ を取り出す */
export function extractTags(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize("NFKC").matchAll(TAG_IN_TEXT)) out.push(normalizeTag(m[1]));
  return out;
}

/** 入力欄のタグ（空白・カンマ区切り）とキャプション中のタグをまとめる（重複除去・最大10個） */
export function collectTags(input: string | string[], caption = ""): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[\s,、，]+/);
  const all = [...parts.map(normalizeTag), ...extractTags(caption)].filter(isValidTag);
  return Array.from(new Set(all)).slice(0, MAX_TAGS);
}

/** 表示用: キャプションを本文とタグに分割する */
export function splitCaption(text: string): { type: "text" | "tag"; value: string }[] {
  const parts: { type: "text" | "tag"; value: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(`[#＃]([${TAG_CHARS}]+)`, "gu"))) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ type: "text", value: text.slice(last, i) });
    parts.push({ type: "tag", value: m[1] });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
