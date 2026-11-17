import { z } from "zod";

// 撮影情報（シャッタースピード・ISO・絞りなど）。位置情報は扱わない。

export const CAPTURE_MODES = ["manual", "auto", "raw", "library", "native"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const CAPTURE_MODE_LABEL: Record<CaptureMode, string> = {
  manual: "マニュアル撮影",
  auto: "オート撮影",
  raw: "RAW現像",
  library: "ライブラリ",
  native: "標準カメラ",
};

const shortText = z.string().max(60).optional();

export const photoMetaSchema = z.object({
  mode: z.enum(CAPTURE_MODES),
  /** 露光時間（秒） */
  exposureTime: z.number().positive().max(3600).optional(),
  iso: z.number().int().min(1).max(409600).optional(),
  fNumber: z.number().min(0.5).max(128).optional(),
  /** 焦点距離（mm） */
  focalLength: z.number().min(0.1).max(5000).optional(),
  make: shortText,
  model: shortText,
  lens: shortText,
  /** RAWファイルの形式（DNG など） */
  rawFormat: z.string().max(10).optional(),
  /** RAWの埋め込みプレビューから現像した場合 true */
  rawPreview: z.boolean().optional(),
  takenAt: z.iso.datetime().optional(),
});

export type PhotoMeta = z.infer<typeof photoMetaSchema>;

/** シャッタースピードの表示 例: 1/250, 1/4, 2s */
export function formatShutter(seconds: number): string {
  if (seconds >= 0.3) {
    const s = Math.round(seconds * 10) / 10;
    return `${s}s`;
  }
  return `1/${Math.round(1 / seconds)}`;
}

export function formatFNumber(f: number): string {
  return `f/${Math.round(f * 10) / 10}`;
}

/** 撮影情報を1行にまとめる 例: 1/250 ・ ISO 100 ・ f/1.8 ・ 26mm */
export function formatPhotoMeta(m: PhotoMeta | null | undefined): string[] {
  if (!m) return [];
  const parts: string[] = [];
  if (m.exposureTime) parts.push(formatShutter(m.exposureTime));
  if (m.iso) parts.push(`ISO ${m.iso}`);
  if (m.fNumber) parts.push(formatFNumber(m.fNumber));
  if (m.focalLength) parts.push(`${Math.round(m.focalLength)}mm`);
  return parts;
}
