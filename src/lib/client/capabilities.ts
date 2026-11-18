"use client";

import { fakeCameraSupported } from "./debug-camera";
import { detectCapabilities, openCamera, type CameraCapabilities, type CameraError, describeCameraError } from "./camera";

// この端末・ブラウザで使える機能の一覧（デバッグモードで表示する）

export type CapabilityRow = { id: string; label: string; ok: boolean; usedFor: string };

const cssSupports = (...rules: string[]) => typeof CSS !== "undefined" && rules.some((r) => CSS.supports(r));

export function detectBrowserCapabilities(): CapabilityRow[] {
  const nav = navigator as Navigator & { share?: unknown };
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  return [
    { id: "secure", label: "安全な接続（HTTPS）", ok: window.isSecureContext, usedFor: "カメラを使うのに必要" },
    { id: "getUserMedia", label: "カメラの映像（getUserMedia）", ok: !!navigator.mediaDevices?.getUserMedia, usedFor: "撮影画面" },
    { id: "imageCapture", label: "静止画の撮影（ImageCapture）", ok: "ImageCapture" in window, usedFor: "高画質の撮影（非対応なら映像から切り出す）" },
    { id: "webgl2", label: "WebGL2", ok: webgl2, usedFor: "写真の現像・お題ごとの表示の効果" },
    { id: "wasm", label: "WebAssembly", ok: typeof WebAssembly === "object", usedFor: "RAW（DNG など）の現像" },
    { id: "worker", label: "Web Worker", ok: typeof Worker !== "undefined", usedFor: "RAW の現像を裏で行う" },
    { id: "captureStream", label: "canvas の映像化（captureStream）", ok: fakeCameraSupported(), usedFor: "疑似カメラ（デバッグ）" },
    { id: "backdrop", label: "すりガラス（backdrop-filter）", ok: cssSupports("backdrop-filter: blur(4px)", "-webkit-backdrop-filter: blur(4px)"), usedFor: "グラスモーフィズムの表示" },
    { id: "colorMix", label: "色の混合（color-mix）", ok: cssSupports("color: color-mix(in oklab, red 50%, blue)"), usedFor: "お題の色に合わせた配色" },
    { id: "dvh", label: "画面の高さの単位（dvh）", ok: cssSupports("height: 100dvh"), usedFor: "スマホでの全画面表示" },
    { id: "orientation", label: "端末の傾き（DeviceOrientation）", ok: "DeviceOrientationEvent" in window, usedFor: "光の当たり方・表示の動き" },
    { id: "share", label: "共有（Web Share）", ok: typeof nav.share === "function", usedFor: "投稿の共有" },
    { id: "io", label: "IntersectionObserver", ok: "IntersectionObserver" in window, usedFor: "フィードの続きの読み込み・閲覧数" },
  ];
}

/** 実際にカメラを開いて、手動設定（シャッタースピード・ISO・絞り）に対応しているか調べる */
export async function probeCamera(): Promise<{ ok: true; caps: CameraCapabilities; label: string } | { ok: false; error: string }> {
  let stream: MediaStream | null = null;
  try {
    stream = await openCamera("environment");
    const track = stream.getVideoTracks()[0] ?? null;
    return { ok: true, caps: detectCapabilities(track), label: track?.label ?? "" };
  } catch (e) {
    return { ok: false, error: typeof e === "string" ? describeCameraError(e as CameraError) : "カメラを開けませんでした" };
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

/** 端末とブラウザのおおまかな種類（ユーザーエージェントから推定） */
export function describeDevice(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "その他";
  const browser = /FxiOS|Firefox/.test(ua)
    ? "Firefox"
    : /EdgiOS|Edg\//.test(ua)
      ? "Edge"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "その他";
  return `${os} / ${browser}`;
}
