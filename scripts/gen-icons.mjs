// アプリのアイコン（PWA・ホーム画面用）を SVG から生成する: node scripts/gen-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("./icon.svg", import.meta.url));
const out = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
  ["src/app/icon.png", 64],
];
for (const [file, size] of out) {
  await sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log("生成:", file);
}
