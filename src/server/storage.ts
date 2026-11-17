import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * 画像などのファイル保存先。
 * - local: .data/uploads に保存（ローカル開発・テスト）
 * - blob : Vercel Blob に保存（本番）
 * どちらの場合も、ブラウザへは同じオリジンの /media/<key> から配信する。
 */
export type StoredObject = { body: ReadableStream<Uint8Array> | Uint8Array; contentType: string; size?: number };

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

export function contentTypeFor(key: string): string {
  return TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

/** 保存キーとして安全か（ディレクトリをさかのぼる指定などを拒否） */
export function isSafeKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9/_.-]{0,200}$/i.test(key) && !key.includes("..") && !key.includes("//");
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/media/${key}` : null;
}

function localDir() {
  return path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads");
}

async function blobModule() {
  return import("@vercel/blob");
}

const blobAccess = () => (process.env.BLOB_ACCESS === "private" ? "private" : "public") as "public" | "private";

export async function putObject(key: string, data: Buffer | Uint8Array, contentType = contentTypeFor(key)) {
  if (!isSafeKey(key)) throw new Error(`invalid storage key: ${key}`);
  if (env.storageDriver === "blob") {
    const { put } = await blobModule();
    await put(key, Buffer.from(data), {
      access: blobAccess(),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return;
  }
  const file = path.join(localDir(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function getObject(key: string): Promise<StoredObject | null> {
  if (!isSafeKey(key)) return null;
  if (env.storageDriver === "blob") {
    const { get } = await blobModule();
    const res = await get(key, { access: blobAccess() }).catch(() => null);
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, contentType: res.blob.contentType || contentTypeFor(key), size: res.blob.size };
  }
  const file = path.join(localDir(), key);
  try {
    const info = await stat(file);
    if (!info.isFile()) return null;
    const buf = await readFile(file);
    return { body: new Uint8Array(buf), contentType: contentTypeFor(key), size: buf.length };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string | null | undefined) {
  if (!key || !isSafeKey(key)) return;
  if (env.storageDriver === "blob") {
    const { del } = await blobModule();
    await del(key).catch(() => {});
    return;
  }
  await rm(path.join(localDir(), key), { force: true }).catch(() => {});
}

/** 指定キーで始まるファイルをまとめて削除（投稿画像の複数サイズなど） */
export async function deleteObjects(keys: (string | null | undefined)[]) {
  await Promise.all(keys.map((k) => deleteObject(k)));
}
