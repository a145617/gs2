import type { NextRequest } from "next/server";
import { route } from "@/server/http/respond";
import { requireDebug } from "@/server/http/debug";
import { buildSampleDng } from "@/server/debug/sample-dng";

/** デバッグ: RAWの読み込み・現像を確認するための、小さな DNG ファイル */
export const GET = route(async (req: NextRequest) => {
  await requireDebug(req);
  const body = new Uint8Array(buildSampleDng());
  return new Response(body, {
    headers: {
      "Content-Type": "image/x-adobe-dng",
      "Content-Disposition": 'attachment; filename="hitokoma-sample.dng"',
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
