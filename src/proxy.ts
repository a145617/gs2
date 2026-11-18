import { NextResponse, type NextRequest } from "next/server";

// ログインしていなくても開けるページ
const PUBLIC_PATHS = ["/login", "/signup", "/offline", "/design"];

/**
 * ログイン用Cookieが無いままアプリの画面を開いたら、ログイン画面へ誘導する。
 * （Cookieの有効性まではここでは確認しない。本当の認証チェックは各APIで行う）
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublic && !req.cookies.has("hk_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|media|_next|icons|sw\\.js|manifest\\.webmanifest|icon\\.png|favicon\\.ico|robots\\.txt).*)"],
};
