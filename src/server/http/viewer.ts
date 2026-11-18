import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, validateSessionToken } from "../auth/session";
import type { SessionRow, UserRow } from "../db/schema";
import { forbidden, unauthorized } from "./respond";

/** リクエストを送ってきたログイン中のユーザー */
export type Viewer = UserRow & { session: SessionRow };

const COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // ブラウザの上限。実際の有効期限はDB側で管理する

export async function getViewer(req: NextRequest): Promise<Viewer | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  if (!result) return null;
  return { ...result.user, session: result.session };
}

export async function requireViewer(req: NextRequest): Promise<Viewer> {
  const viewer = await getViewer(req);
  if (!viewer) throw unauthorized();
  return viewer;
}

export async function requireAdmin(req: NextRequest): Promise<Viewer> {
  const viewer = await requireViewer(req);
  if (viewer.role !== "admin") throw forbidden("管理者のみ利用できます");
  return viewer;
}

function isSecure(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function setSessionCookie(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(req: NextRequest, res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecure(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
