import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { clientIp } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessCode, accessToken, isCorrectCode } from "@/server/access";

const schema = z.object({ code: z.string("合言葉を入力してください").max(200) });

/** 合言葉の確認。正しければ、この端末で開けるように Cookie を保存する */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const code = accessCode();
  if (!code) return json({ ok: true, required: false });
  // 総当たりを防ぐ（同じ接続元から15分に10回まで。デバッグモードでも緩めない）
  const limit = await hitRateLimit(`access:${clientIp(req)}`, 10, 15 * 60, { strict: true });
  if (!limit.ok) throw tooMany(limit.retryAfterSec, "試行回数が多すぎます。しばらく待ってからもう一度お試しください");
  const { code: input } = schema.parse(await readJson(req));
  if (!input.trim()) throw badRequest("合言葉を入力してください", { fields: { code: "合言葉を入力してください" } });
  if (!(await isCorrectCode(input))) throw badRequest("合言葉が違います", { fields: { code: "合言葉が違います" } });
  const res = json({ ok: true, required: true });
  res.cookies.set(ACCESS_COOKIE, await accessToken(code), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  return res;
});
