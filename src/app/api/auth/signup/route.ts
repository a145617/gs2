import type { NextRequest } from "next/server";
import { route, json, readJson, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp, setSessionCookie } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { createSession } from "@/server/auth/session";
import { createUser, toMe } from "@/server/services/users";
import { signupSchema } from "@/lib/validation";

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const limit = await hitRateLimit(`signup:${clientIp(req)}`, 20, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const input = signupSchema.parse(await readJson(req));
  const user = await createUser(input);
  const { token } = await createSession(user.id, { userAgent: req.headers.get("user-agent") });
  const res = json({ user: toMe(user) }, { status: 201 });
  setSessionCookie(req, res, token);
  return res;
});
