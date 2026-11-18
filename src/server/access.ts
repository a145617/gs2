// 合言葉（パスフレーズ）による入場制限。
// 環境変数 ACCESS_CODE が設定されているときだけ有効になり、合言葉を一度入力した端末（Cookie）だけが
// 画面・API・画像を開ける。実験的な配布（デバッグモードのまま限られた人に試してもらう）のための機能。
// proxy（ミドルウェア）からも使うので、Node.js 専用の機能は使わない（Web Crypto のみ）。

export const ACCESS_COOKIE = "hk_access";
/** 合言葉の Cookie の有効期間（秒） */
export const ACCESS_MAX_AGE = 90 * 24 * 60 * 60;

/** 設定されている合言葉（未設定なら null = 入場制限なし） */
export function accessCode(): string | null {
  const v = process.env.ACCESS_CODE?.trim();
  return v ? v : null;
}

/** Cookie に保存する値（合言葉そのものは保存しない。合言葉を変えると以前の Cookie は使えなくなる） */
export async function accessToken(code: string): Promise<string> {
  const data = new TextEncoder().encode(`hitokoma-access:${code}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長さの同じ文字列を、かかる時間が中身によって変わらないように比べる */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** この Cookie の値で入場できるか（合言葉が未設定なら常に入場できる） */
export async function hasAccess(cookieValue: string | undefined): Promise<boolean> {
  const code = accessCode();
  if (!code) return true;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await accessToken(code));
}

/**
 * 入力された合言葉が正しいか（前後の空白・全角半角の違いは無視する）。
 * ハッシュどうしを比べるので、比べる時間から合言葉の長さや中身は分からない。
 */
export async function isCorrectCode(input: string): Promise<boolean> {
  const code = accessCode();
  if (!code) return true;
  const norm = (s: string) => s.normalize("NFKC").trim();
  return safeEqual(await accessToken(norm(input)), await accessToken(norm(code)));
}
