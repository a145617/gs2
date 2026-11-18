"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useMe } from "./session";
import { EXPOSURE_UNIT_PER_SECOND, type CameraCapabilities } from "./camera";

// デバッグモード用の「疑似カメラ」。
// カメラの無いPCや自動テストでも撮影の流れを確認できるよう、Unsplash の写真（assets/demo-photos）を
// ゆっくり動かした映像をカメラの代わりに流す。
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

/** 疑似カメラに映す写真を読み込む（color があればその色に近い写真） */
async function loadScene(color: string | null): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = `/api/debug/demo-photo?${color ? `color=${encodeURIComponent(color)}&` : ""}t=${Date.now()}`;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

async function createFakeStream(): Promise<MediaStream> {
  if (!fakeCameraSupported()) throw "unsupported";
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  let exposure = 1;
  let running = true;
  const t0 = performance.now();
  // 最初の写真を読み込んでから映し始める（イベントの撮影では担当の色に近い写真）
  let sceneFor = sceneColor;
  let scene = await loadScene(sceneFor);

  const draw = () => {
    if (!running) return;
    const t = (performance.now() - t0) / 1000;
    const w = canvas.width;
    const h = canvas.height;
    if (sceneColor !== sceneFor) {
      // 映す色が変わった（イベントの担当の色が分かった）ら、その色に近い写真に替える
      const want = sceneColor;
      sceneFor = want;
      void loadScene(want).then((img) => {
        if (img && sceneFor === want) scene = img;
      });
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (scene) {
      // 手持ちのカメラのように、写真をゆっくり拡大・移動させる
      const zoom = 1.08 + Math.sin(t / 5) * 0.04;
      const s = Math.max(w / scene.naturalWidth, h / scene.naturalHeight) * zoom;
      const dw = scene.naturalWidth * s;
      const dh = scene.naturalHeight * s;
      ctx.drawImage(scene, (w - dw) / 2 + Math.sin(t / 7) * w * 0.02, (h - dh) / 2 + Math.cos(t / 9) * h * 0.02, dw, dh);
    }
    if (exposure !== 1) {
      ctx.fillStyle = exposure > 1 ? `rgba(255,255,255,${Math.min(0.75, (exposure - 1) * 0.25)})` : `rgba(0,0,0,${Math.min(0.85, 1 - exposure)})`;
      ctx.fillRect(0, 0, w, h);
    }
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
