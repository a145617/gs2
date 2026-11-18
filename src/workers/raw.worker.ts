/// <reference lib="webworker" />
// RAWファイル（DNG / CR2 / NEF / ARW など）を現像用のデータに変換する Web Worker。
// LibRaw（WebAssembly）で 16bit・リニア（ガンマ無し）・sRGB で展開し、
// 縮小したうえで半精度浮動小数（RGBA）にして返す。ブラウザ側の WebGL2 で現像する。
import { LibRaw } from "@colorhythm/libraw-wasm";

declare const self: DedicatedWorkerGlobalScope;

type Request = { id: number; buffer: ArrayBuffer; maxSize: number };

export type RawMeta = {
  make?: string;
  model?: string;
  iso?: number;
  exposureTime?: number;
  fNumber?: number;
  focalLength?: number;
  takenAt?: string;
};

export type RawResponse =
  | { id: number; ok: true; kind: "linear"; width: number; height: number; data: ArrayBuffer; meta: RawMeta }
  | { id: number; ok: true; kind: "jpeg"; data: ArrayBuffer; meta: RawMeta }
  | { id: number; ok: false; error: string };

let ready: Promise<unknown> | null = null;
function init() {
  ready ??= fetch(new URL("./libraw.wasm", self.location.href))
    .then((r) => {
      if (!r.ok) throw new Error(`libraw.wasm を読み込めませんでした (${r.status})`);
      return r.arrayBuffer();
    })
    .then((buf) => LibRaw.initialize(buf));
  return ready;
}

// float32 → float16（ビット列）
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let e = ((x >>> 23) & 0xff) - 127 + 15;
  const m = x & 0x7fffff;
  if (e <= 0) {
    if (e < -10) return sign;
    const mm = (m | 0x800000) >> (1 - e);
    return sign | ((mm + 0x1000) >> 13);
  }
  if (e >= 31) return sign | 0x7c00;
  const half = sign | (e << 10) | ((m + 0x1000) >> 13);
  // 丸めで指数が繰り上がった場合もそのまま有効な値になる
  e = 0;
  return half;
}

function clean(s: unknown): string | undefined {
  const v = typeof s === "string" ? s.replace(/\0/g, "").trim() : "";
  return v ? v.slice(0, 60) : undefined;
}

function readMeta(lr: LibRaw): RawMeta {
  const meta: RawMeta = {};
  try {
    const ip = lr.getIParams() as { make?: string; model?: string };
    meta.make = clean(ip.make);
    meta.model = clean(ip.model);
  } catch {
    // 取得できない形式もある
  }
  try {
    const o = lr.getImgOther();
    if (o.iso_speed > 0) meta.iso = Math.round(o.iso_speed);
    if (o.shutter > 0) meta.exposureTime = o.shutter;
    if (o.aperture > 0) meta.fNumber = Math.round(o.aperture * 10) / 10;
    if (o.focal_len > 0) meta.focalLength = o.focal_len;
    const ts = Number(o.timestamp);
    if (ts > 0) meta.takenAt = new Date(ts * 1000).toISOString();
  } catch {
    // 取得できない形式もある
  }
  return meta;
}

/** 16bit の RGB 画像を、長辺 maxSize 以下に縮小して float16 の RGBA にする */
function toHalfRgba(src: Uint16Array, w: number, h: number, colors: number, maxSize: number) {
  const f = Math.max(1, Math.ceil(Math.max(w, h) / maxSize));
  const ow = Math.floor(w / f);
  const oh = Math.floor(h / f);
  const out = new Uint16Array(ow * oh * 4);
  const scale = 1 / (65535 * f * f);
  const one = toHalf(1);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * w;
        for (let dx = 0; dx < f; dx++) {
          const i = (row + x * f + dx) * colors;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
        }
      }
      const o = (y * ow + x) * 4;
      out[o] = toHalf(r * scale);
      out[o + 1] = toHalf(g * scale);
      out[o + 2] = toHalf(b * scale);
      out[o + 3] = one;
    }
  }
  return { data: out, width: ow, height: oh };
}

self.onmessage = async (ev: MessageEvent<Request>) => {
  const { id, buffer, maxSize } = ev.data;
  const reply = (msg: RawResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
  let lr: LibRaw | null = null;
  try {
    await init();
    lr = new LibRaw();
    await lr.waitUntilReady();
    lr.open(buffer);
    const meta = readMeta(lr);
    try {
      lr.unpack();
      const big = Math.max(lr.getIWidth?.() ?? 0, lr.getIHeight?.() ?? 0, lr.getActiveWidth(), lr.getActiveHeight());
      lr.setHalfSize(big > maxSize * 1.6 ? 1 : 0);
      lr.setUseCameraWb(1);
      lr.setOutputColor(1); // sRGB
      lr.setOutputBps(16);
      lr.setGamma(0, 1); // リニア（ガンマ補正なし）
      lr.setGamma(1, 1);
      lr.setNoAutoBright(1);
      lr.setHighlight(0);
      lr.dcrawProcess();
      const img = lr.dcrawMakeMemImage();
      if (img.bits !== 16 || img.colors < 3) throw new Error("unsupported output");
      const u16 = new Uint16Array(img.data.buffer, img.data.byteOffset, img.data.byteLength / 2);
      const out = toHalfRgba(u16, img.width, img.height, img.colors, maxSize);
      reply(
        { id, ok: true, kind: "linear", width: out.width, height: out.height, data: out.data.buffer, meta },
        [out.data.buffer],
      );
    } catch {
      // センサーデータを展開できない形式（新しい圧縮方式など）は、埋め込みのプレビューJPEGで現像する
      lr.unpackThumb();
      const th = lr.dcrawMakeMemThumb();
      if (th.type_ !== "LIBRAW_IMAGE_JPEG") throw new Error("このRAW形式には対応していません");
      const copy = th.data.slice();
      reply({ id, ok: true, kind: "jpeg", data: copy.buffer, meta }, [copy.buffer]);
    }
  } catch (e) {
    reply({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    try {
      lr?.dispose();
    } catch {
      // 破棄に失敗しても次の処理には影響しない
    }
  }
};
