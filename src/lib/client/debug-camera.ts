"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useMe } from "./session";
import { EXPOSURE_UNIT_PER_SECOND, type CameraCapabilities } from "./camera";

// デバッグモード用の「疑似カメラ」。
// カメラの無いPCや自動テストでも撮影の流れを確認できるよう、アニメーションする風景の映像を流す。
// 「疑似カメラ（手動設定あり）」では、シャッタースピード・ISOに対応した端末のふりをする。

export type DebugCameraMode = "off" | "fake" | "fake-manual";
const KEY = "hk:debugCamera";

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function read(): DebugCameraMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "fake" || v === "fake-manual" ? v : "off";
  } catch {
    return "off";
  }
}

export function setDebugCameraMode(mode: DebugCameraMode) {
  try {
    if (mode === "off") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // 保存できなくても無視
  }
  for (const l of listeners) l();
}

export function useDebugCameraMode(): DebugCameraMode {
  return useSyncExternalStore(subscribe, read, () => "off" as DebugCameraMode);
}

/** 疑似カメラの映像に大きく映す色（イベントの指定色の確認用） */
let sceneColor: string | null = null;
export function setFakeSceneColor(hex: string | null) {
  sceneColor = hex;
}

/** 疑似カメラ（canvas の映像をカメラの代わりに流す）が使えるブラウザか */
export function fakeCameraSupported(): boolean {
  return typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function createFakeStream(): MediaStream {
  if (!fakeCameraSupported()) throw "unsupported";
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  let exposure = 1;
  let running = true;
  const t0 = performance.now();

  const draw = () => {
    if (!running) return;
    const t = (performance.now() - t0) / 1000;
    const w = canvas.width;
    const h = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2f6fd6");
    sky.addColorStop(0.65, "#a9d4ff");
    sky.addColorStop(1, "#f5d7a8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff4c4";
    ctx.beginPath();
    ctx.arc(w * 0.75, h * 0.25 + Math.sin(t / 3) * 20, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 4; i++) {
      const x = ((t * 40 + i * 360) % (w + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(x, h * (0.18 + i * 0.1), 160, 42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sceneColor) {
      ctx.fillStyle = sceneColor;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.33, Math.sin(t) * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#33463a";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    if (exposure !== 1) {
      ctx.fillStyle = exposure > 1 ? `rgba(255,255,255,${Math.min(0.75, (exposure - 1) * 0.25)})` : `rgba(0,0,0,${Math.min(0.85, 1 - exposure)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("疑似カメラ（デバッグ）", 28, h - 30);
    requestAnimationFrame(draw);
  };
  draw();

  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  let settings = { exposureTime: 80, iso: 100 };
  // 手動設定の反映を疑似的に再現する（明るさが変わる）
  track.applyConstraints = async (c?: MediaTrackConstraints) => {
    const adv = (c?.advanced?.[0] ?? {}) as { exposureTime?: number; iso?: number; exposureMode?: string };
    if (adv.exposureMode === "continuous") {
      exposure = 1;
      settings = { exposureTime: 80, iso: 100 };
      return;
    }
    settings = { exposureTime: adv.exposureTime ?? settings.exposureTime, iso: adv.iso ?? settings.iso };
    // 基準: 1/125秒・ISO100 で適正
    exposure = (settings.exposureTime / EXPOSURE_UNIT_PER_SECOND / (1 / 125)) * (settings.iso / 100);
  };
  const origSettings = track.getSettings.bind(track);
  track.getSettings = () => ({ ...origSettings(), ...settings }) as MediaTrackSettings;
  const origStop = track.stop.bind(track);
  track.stop = () => {
    running = false;
    origStop();
  };
  return stream;
}

const fakeManual = (c: CameraCapabilities): CameraCapabilities => ({
  ...c,
  shutter: { min: 1, max: 5000, step: 1 },
  iso: { min: 50, max: 3200, step: 1 },
  current: { exposureTime: 80, iso: 100 },
});

/** デバッグモードで疑似カメラが有効なら、カメラの起動処理・対応状況を差し替える */
export function useDebugCamera() {
  const { debugMode } = useMe();
  const mode = useDebugCameraMode();
  return useMemo(() => {
    if (!debugMode || mode === "off") return {};
    return {
      streamFactory: async () => createFakeStream(),
      capabilityOverride: mode === "fake-manual" ? fakeManual : undefined,
    };
  }, [debugMode, mode]);
}
