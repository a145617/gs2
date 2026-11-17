import sharp from "sharp";
import { badRequest } from "./http/respond";
import { analyzeColors, type ColorFeatures } from "@/lib/color";

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

export type ProcessedPostImage = {
  lg: Buffer;
  md: Buffer;
  sm: Buffer;
  /** イベントのピクセルアートに使う正方形の小さな画像（data URL） */
  tile: string;
  placeholder: string;
  width: number;
  height: number;
  colors: ColorFeatures;
  /** 色判定用の縮小画素（RGB, 96px 以内） */
  analysis: { data: Buffer; width: number; height: number };
};

/**
 * 投稿画像を処理する: 向きを補正し、3サイズの WebP・ぼかし用プレビュー・色の特徴量を作る。
 * メタデータ（位置情報など）は書き出さない。
 */
export async function processPostImage(buf: Buffer): Promise<ProcessedPostImage> {
  try {
    const [lg, md, sm, ph, tile, small] = await Promise.all([
      pipeline(buf)
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer({ resolveWithObject: true }),
      pipeline(buf).resize(1080, 1080, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      pipeline(buf).resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
      pipeline(buf).resize(24, 24, { fit: "inside" }).webp({ quality: 45 }).toBuffer(),
      pipeline(buf).resize(24, 24, { fit: "cover", position: "attention" }).webp({ quality: 60 }).toBuffer(),
      pipeline(buf).resize(96, 96, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const colors = analyzeColors(small.data, 3);
    return {
      lg: lg.data,
      md,
      sm,
      tile: `data:image/webp;base64,${tile.toString("base64")}`,
      placeholder: `data:image/webp;base64,${ph.toString("base64")}`,
      width: lg.info.width,
      height: lg.info.height,
      colors,
      analysis: { data: small.data, width: small.info.width, height: small.info.height },
    };
  } catch {
    throw badRequest("画像を読み込めませんでした。別の画像でお試しください");
  }
}
