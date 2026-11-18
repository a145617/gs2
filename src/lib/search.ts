// 検索用の文字列の正規化（全角英数→半角、大文字→小文字、空白を詰める）

export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 投稿の検索用テキスト（タイトル・キャプション・ハッシュタグ） */
export function buildSearchText(title: string, caption: string, tags: string[]): string {
  return normalizeForSearch([title, caption, ...tags.map((t) => `#${t}`)].join(" "));
}

/** 検索語を分割する（空白区切り・最大5語） */
export function splitQuery(q: string): string[] {
  return normalizeForSearch(q)
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** LIKE 検索の特殊文字（% _ \）を無効化する */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
