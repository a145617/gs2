"use client";

import type { PhotoMeta } from "@/lib/photo-meta";

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/\0/g, "").trim().slice(0, 60) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** 画像ファイルの撮影情報（EXIF）を読む。位置情報は読まない */
export async function readPhotoMeta(file: Blob): Promise<Partial<PhotoMeta>> {
  try {
    const { default: exifr } = await import("exifr");
    const d = (await exifr.parse(file, {
      gps: false,
      interop: false,
      pick: ["ExposureTime", "ISO", "ISOSpeedRatings", "FNumber", "FocalLength", "Make", "Model", "LensModel", "DateTimeOriginal"],
    })) as Record<string, unknown> | undefined;
    if (!d) return {};
    const iso = num(d.ISO) ?? num(Array.isArray(d.ISOSpeedRatings) ? d.ISOSpeedRatings[0] : d.ISOSpeedRatings);
    const taken = d.DateTimeOriginal instanceof Date && !Number.isNaN(d.DateTimeOriginal.getTime()) ? d.DateTimeOriginal : null;
    return {
      exposureTime: num(d.ExposureTime),
      iso: iso ? Math.round(iso) : undefined,
      fNumber: num(d.FNumber),
      focalLength: num(d.FocalLength),
      make: text(d.Make),
      model: text(d.Model),
      lens: text(d.LensModel),
      takenAt: taken ? taken.toISOString() : undefined,
    };
  } catch {
    return {};
  }
}

/** 値が無い項目を取り除く（サーバーの入力チェックに通る形にする） */
export function compactMeta(m: Partial<PhotoMeta> & Pick<PhotoMeta, "mode">): PhotoMeta {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  if (typeof out.iso === "number") out.iso = Math.round(out.iso);
  return out as PhotoMeta;
}
