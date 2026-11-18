import type { NextRequest } from "next/server";
import { route, json, readJson, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, setSessionCookie } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { createSession } from "@/server/auth/session";
import { authenticate, toMe } from "@/server/services/users";
import { loginSchema } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const input = loginSchema.parse(await readJson(req));
  // 同じIP・同じメールアドレスへの総当たりを防ぐ
  const limit = await hitRateLimit(`login:${clientIp(req)}:${input.email}`, 10, 15 * 60);
  if (!limit.ok) {
    throw tooMany(limit.retryAfterSec, "ログインの試行回数が多すぎます。しばらく待ってからお試しください");
  }
  const user = await authenticate(input.email, input.password);
  const { token } = await createSession(user.id, { userAgent: req.headers.get("user-agent") });
  const res = json({ user: toMe(user) });
  setSessionCookie(req, res, token);
  return res;
});
