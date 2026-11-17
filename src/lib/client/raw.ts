"use client";

import type { RawMeta, RawResponse } from "@/workers/raw.worker";

export type { RawMeta };

export type RawResult =
  | { kind: "linear"; width: number; height: number; data: Uint16Array; meta: RawMeta }
  | { kind: "jpeg"; blob: Blob; meta: RawMeta };

/** 対応するRAWファイルの拡張子 */
export const RAW_EXTENSIONS = [
  ".dng", ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".raf", ".orf", ".rw2", ".pef", ".srw", ".x3f", ".3fr", ".iiq", ".rwl",
];

export function isRawFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return RAW_EXTENSIONS.some((ext) => name.endsWith(ext)) || file.type === "image/x-adobe-dng" || file.type === "image/dng";
}

let worker: Worker | null = null;
let seq = 0;

/**
 * RAWファイルを Web Worker（LibRaw / WebAssembly）で展開する。
 * 長辺 maxSize 以下のリニアな半精度RGBAを返す（展開できない形式は埋め込みプレビューJPEG）。
 */
export function decodeRaw(file: File, maxSize = 3000): Promise<RawResult> {
  worker ??= new Worker("/workers/raw.js", { type: "module" });
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<RawResponse>) => {
      if (ev.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      const msg = ev.data;
      if (!msg.ok) return reject(new Error(msg.error));
      if (msg.kind === "linear") {
        resolve({ kind: "linear", width: msg.width, height: msg.height, data: new Uint16Array(msg.data), meta: msg.meta });
      } else {
        resolve({ kind: "jpeg", blob: new Blob([msg.data], { type: "image/jpeg" }), meta: msg.meta });
      }
    };
    const onError = (ev: ErrorEvent) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      worker?.terminate();
      worker = null;
      reject(new Error(ev.message || "RAWの処理中にエラーが発生しました"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    file.arrayBuffer().then(
      (buffer) => w.postMessage({ id, buffer, maxSize }, [buffer]),
      (e) => reject(e),
    );
  });
}
