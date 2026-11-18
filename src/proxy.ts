import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessCode, hasAccess } from "@/server/access";

// ログインしていなくても開けるページ
const PUBLIC_PATHS = ["/login", "/signup", "/offline", "/design", "/access"];
// 合言葉を入力していなくても開けるパス（合言葉の入力画面とその API、データを含まないオフライン画面）
const ACCESS_PATHS = ["/access", "/api/access", "/offline"];

const matches = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * 1. 合言葉（環境変数 ACCESS_CODE）が設定されていれば、入力済みの端末だけを通す
 *    （画面は合言葉の入力画面へ誘導し、API・画像は 401 を返す）。
 * 2. ログイン用Cookieが無いままアプリの画面を開いたら、ログイン画面へ誘導する。
 *    （Cookieの有効性まではここでは確認しない。本当の認証チェックは各APIで行う）
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/") || pathname.startsWith("/media/");

  if (accessCode() && !matches(pathname, ACCESS_PATHS) && !(await hasAccess(req.cookies.get(ACCESS_COOKIE)?.value))) {
    if (isApi) {
      return NextResponse.json(
        { error: { code: "access_code_required", message: "合言葉を入力してください" } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/access";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (isApi) return NextResponse.next();
  const isPublic = matches(pathname, PUBLIC_PATHS);
  if (!isPublic && !req.cookies.has("hk_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 静的ファイル（アイコン・ワーカー・ビルド済みの JS/CSS など）には使わない
  matcher: ["/((?!_next|icons|workers|samples|sw\\.js|manifest\\.webmanifest|icon\\.png|favicon\\.ico|robots\\.txt).*)"],
};
