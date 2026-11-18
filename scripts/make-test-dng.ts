// E2Eテスト用の DNG（RAW）ファイルを作る: npx tsx scripts/make-test-dng.ts [出力先]
// デバッグ画面で配るサンプルと同じもの（Unsplash の写真から作った、リニアRGB・16bit の DNG）。
import { writeFile } from "node:fs/promises";
import { buildSampleDng } from "../src/server/debug/sample-dng";

const out = process.argv[2] ?? "e2e/fixtures/sample.dng";
const buf = await buildSampleDng();
await writeFile(out, buf);
console.log(`[dng] ${out} を作成しました（${buf.length} bytes）`);
