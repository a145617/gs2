import { createHash, randomBytes, randomInt } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// 読み間違えやすい文字（0/o, 1/l/i）を除いた英数字
const HANDLE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 自動で割り振るユーザーID（8文字） */
export function generateHandle(length = 8): string {
  let s = "";
  for (let i = 0; i < length; i++) s += HANDLE_ALPHABET[randomInt(HANDLE_ALPHABET.length)];
  return s;
}

/** 推測できないランダムな英数字（画像URLなどに使う） */
export function randomId(length = 20): string {
  let s = "";
  for (let i = 0; i < length; i++) s += HANDLE_ALPHABET[randomInt(HANDLE_ALPHABET.length)];
  return s;
}
