import sharp from "sharp";
import { badRequest } from "./http/respond";

/** 受け付ける画像形式（ファイル先頭のバイトで判定） */
export function sniffImageType(buf: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "webp";
  return null;
}

/** フォームから画像ファイルを取り出し、形式とサイズを確認する */
export async function readImageFile(form: FormData, field: string, maxBytes: number): Promise<Buffer> {
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0) throw badRequest("画像ファイルを選んでください");
  if (file.size > maxBytes) {
    throw badRequest(`画像が大きすぎます（${Math.round(maxBytes / 1024 / 1024)}MBまで）`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffImageType(buf)) throw badRequest("JPEG・PNG・WebP の画像を選んでください");
  return buf;
}

function pipeline(buf: Buffer) {
  // 撮影時の向きを反映し、位置情報などのメタデータは書き出さない（sharp の既定動作）
  return sharp(buf, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
}

/** アイコン画像: 正方形 320px の WebP */
export async function processAvatar(buf: Buffer): Promise<Buffer> {
  try {
    return await pipeline(buf)
      .resize(320, 320, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badRequest("画像を読み込めませんでした。別の画像でお試しください");
  }
}

export { pipeline as imagePipeline };
