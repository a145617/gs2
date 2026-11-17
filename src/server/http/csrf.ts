import type { NextRequest } from "next/server";
import { forbidden } from "./respond";

/**
 * 状態を変更するリクエストが同じサイトから来たかを確認する（CSRF対策）。
 * Cookie は SameSite=Lax だが、念のため Origin ヘッダーも検証する。
 */
export function assertSameOrigin(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw forbidden("不正なリクエストです");
    }
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    if (originHost !== host) throw forbidden("不正なリクエストです");
    return;
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw forbidden("不正なリクエストです");
  }
}
