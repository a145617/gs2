import type { NextRequest } from "next/server";
import { getObject, isSafeKey } from "@/server/storage";

/**
 * 保存した画像を同じオリジンから配信する。
 * 画像のキーには推測できない文字列が含まれ、内容も変わらないので長期キャッシュする。
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const path = key.join("/");
  if (!isSafeKey(path)) return new Response("Not found", { status: 404 });
  const obj = await getObject(path);
  if (!obj) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (obj.size) headers["Content-Length"] = String(obj.size);
  return new Response(obj.body as BodyInit, { headers });
}
