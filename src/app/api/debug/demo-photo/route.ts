import type { NextRequest } from "next/server";
import { route, notFound } from "@/server/http/respond";
import { requireDebug } from "@/server/http/debug";
import { DEMO_PHOTOS, loadDemoPhoto, photoForColor } from "@/server/debug/demo-photos";

/**
 * デバッグ: 疑似カメラに映す写真（Unsplash の写真から1枚）。
 * color（#rrggbb）を付けると、その色に近い写真を返す（イベントの担当の色を映す確認用）。
 */
export const GET = route(async (req: NextRequest) => {
  await requireDebug(req);
  const color = req.nextUrl.searchParams.get("color");
  const photo = color && /^#[0-9a-f]{6}$/i.test(color) ? photoForColor(color) : DEMO_PHOTOS[Math.floor(Math.random() * DEMO_PHOTOS.length)];
  const body = await loadDemoPhoto(photo);
  if (!body) throw notFound("写真が見つかりません");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "no-store",
      // 撮影者（Unsplash）
      "X-Photo-Credit": encodeURIComponent(`${photo.title} / ${photo.by}（Unsplash）`),
    },
  });
});
