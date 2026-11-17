import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { clearSessionCookie } from "@/server/http/viewer";
import { SESSION_COOKIE, deleteSessionByToken } from "@/server/auth/session";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
  const res = json({ ok: true });
  clearSessionCookie(req, res);
  return res;
});
