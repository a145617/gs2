// ブラウザ用の Web Worker（RAW現像）をビルドして public/workers に出力する。
// npm run dev / build の前に自動で実行される。
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const outDir = "public/workers";
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: ["src/workers/raw.worker.ts"],
  outfile: path.join(outDir, "raw.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020", "safari15", "firefox114", "chrome90"],
  minify: true,
  legalComments: "none",
  // Emscripten の Node.js 用コードはブラウザでは使わない
  external: ["module", "fs", "path", "url", "worker_threads", "crypto", "node:*"],
  logLevel: "warning",
});

await copyFile(require.resolve("@colorhythm/libraw-wasm/libraw.wasm"), path.join(outDir, "libraw.wasm"));
console.log("[workers] public/workers/raw.js と libraw.wasm を出力しました");
