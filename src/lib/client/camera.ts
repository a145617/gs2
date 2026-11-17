"use client";

// カメラ（MediaStream Image Capture API）
// - シャッタースピード（exposureTime）と ISO は、端末とブラウザが対応していれば手動で設定できる
// - 絞り（F値）はWebから操作する手段が無く、スマホのレンズもほぼ固定絞りなので設定できない
// - RAW（センサーの生データ）はブラウザからは取得できないため、RAWファイルの取り込みで対応する

export type Range = { min: number; max: number; step: number };

export type CameraCapabilities = {
  /** シャッタースピード（露光時間）を手動で設定できるか */
  shutter: Range | null;
  iso: Range | null;
  /** 絞り: Web では常に設定不可 */
  aperture: null;
  exposureCompensation: Range | null;
  colorTemperature: Range | null;
  zoom: Range | null;
  torch: boolean;
  focusDistance: Range | null;
  /** ImageCapture.takePhoto が使えるか（高解像度での撮影） */
  takePhoto: boolean;
  /** 現在の設定値（取得できれば） */
  current: { exposureTime?: number; iso?: number };
};

type ExtCaps = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: { min: number; max: number; step: number };
  iso?: { min: number; max: number; step: number };
  exposureCompensation?: { min: number; max: number; step: number };
  colorTemperature?: { min: number; max: number; step: number };
  zoom?: { min: number; max: number; step: number };
  torch?: boolean;
  focusDistance?: { min: number; max: number; step: number };
};

type ExtSettings = MediaTrackSettings & { exposureTime?: number; iso?: number };

const range = (r?: { min: number; max: number; step: number }): Range | null =>
  r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.max > r.min
    ? { min: r.min, max: r.max, step: r.step || 0 }
    : null;

/**
 * Image Capture API の exposureTime は 100マイクロ秒単位（仕様）。
 * 秒に直すには 10000 で割る。
 */
export const EXPOSURE_UNIT_PER_SECOND = 10000;

export function detectCapabilities(track: MediaStreamTrack | null): CameraCapabilities {
  const caps = (track?.getCapabilities?.() ?? {}) as ExtCaps;
  const settings = (track?.getSettings?.() ?? {}) as ExtSettings;
  const manualExposure = Array.isArray(caps.exposureMode) && caps.exposureMode.includes("manual");
  return {
    shutter: manualExposure ? range(caps.exposureTime) : null,
    iso: range(caps.iso),
    aperture: null,
    exposureCompensation: range(caps.exposureCompensation),
    colorTemperature: range(caps.colorTemperature),
    zoom: range(caps.zoom),
    torch: caps.torch === true,
    focusDistance: range(caps.focusDistance),
    takePhoto: typeof window !== "undefined" && "ImageCapture" in window,
    current: { exposureTime: settings.exposureTime, iso: settings.iso },
  };
}

/** 一般的なシャッタースピードの段（秒） */
const SHUTTER_STOPS = [
  1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4,
];
const ISO_STOPS = [25, 50, 64, 100, 125, 200, 400, 800, 1600, 3200, 6400, 12800];

/** 端末が設定できる範囲に入るシャッタースピードの候補（秒） */
export function shutterOptions(r: Range): number[] {
  const minS = r.min / EXPOSURE_UNIT_PER_SECOND;
  const maxS = r.max / EXPOSURE_UNIT_PER_SECOND;
  const list = SHUTTER_STOPS.filter((s) => s >= minS * 0.98 && s <= maxS * 1.02);
  if (list.length === 0) return [minS, maxS];
  return list;
}

export function isoOptions(r: Range): number[] {
  const list = ISO_STOPS.filter((v) => v >= r.min && v <= r.max);
  if (!list.includes(r.min)) list.unshift(r.min);
  if (!list.includes(r.max)) list.push(r.max);
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

export type ManualSettings = { shutterSec?: number; iso?: number };

/** 手動設定を反映する。対応していない項目は無視される */
export async function applyManual(track: MediaStreamTrack, caps: CameraCapabilities, s: ManualSettings | null) {
  const c: Record<string, unknown> = {};
  if (!s) {
    c.exposureMode = "continuous";
  } else {
    if (caps.shutter && s.shutterSec) {
      c.exposureMode = "manual";
      c.exposureTime = Math.min(caps.shutter.max, Math.max(caps.shutter.min, s.shutterSec * EXPOSURE_UNIT_PER_SECOND));
    }
    if (caps.iso && s.iso) {
      c.iso = Math.min(caps.iso.max, Math.max(caps.iso.min, s.iso));
      // ISO だけ手動にできる端末では、露出モードも手動にする必要がある
      if (caps.shutter) c.exposureMode = "manual";
    }
  }
  if (Object.keys(c).length === 0) return;
  await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
}

export type CameraError = "insecure" | "unsupported" | "denied" | "notfound" | "busy" | "unknown";

export function describeCameraError(e: CameraError): string {
  switch (e) {
    case "insecure":
      return "カメラはHTTPSで開いたページでのみ使えます。";
    case "unsupported":
      return "このブラウザはアプリ内カメラに対応していません。下の「標準カメラで撮る」を使ってください。";
    case "denied":
      return "カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください。";
    case "notfound":
      return "カメラが見つかりませんでした。";
    case "busy":
      return "カメラを起動できませんでした（ほかのアプリが使用中の可能性があります）。";
    default:
      return "カメラを起動できませんでした。";
  }
}

export async function openCamera(facing: "environment" | "user" = "environment"): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) throw "insecure" satisfies CameraError;
  if (!navigator.mediaDevices?.getUserMedia) throw "unsupported" satisfies CameraError;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw "denied" satisfies CameraError;
    if (name === "NotFoundError" || name === "OverconstrainedError") throw "notfound" satisfies CameraError;
    if (name === "NotReadableError" || name === "AbortError") throw "busy" satisfies CameraError;
    throw "unknown" satisfies CameraError;
  }
}

type ImageCaptureLike = {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  getPhotoCapabilities?(): Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>;
};

/** 撮影する: 対応していれば ImageCapture.takePhoto（高解像度）、だめなら映像の1コマを切り出す */
export async function capturePhoto(video: HTMLVideoElement, track: MediaStreamTrack | null): Promise<Blob> {
  const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (IC && track && track.readyState === "live") {
    try {
      const ic = new IC(track);
      const pc = await ic.getPhotoCapabilities?.().catch(() => undefined);
      const opts = pc?.imageWidth?.max ? { imageWidth: pc.imageWidth.max, imageHeight: pc.imageHeight?.max } : undefined;
      const blob = await ic.takePhoto(opts);
      if (blob && blob.size > 0) return blob;
    } catch {
      // 対応していない端末もあるので、下の方法に切り替える
    }
  }
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("カメラの映像がまだ準備できていません");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95));
  if (!blob) throw new Error("撮影に失敗しました");
  return blob;
}
