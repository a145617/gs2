import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest, notFound } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { setSessionCookie } from "@/server/http/viewer";
import { createSession, deleteSessionByToken, SESSION_COOKIE } from "@/server/auth/session";
import { getUserById, toMe } from "@/server/services/users";

/**
 * デバッグ: テスト用ユーザーに切り替える（ログインし直さずに、別の人としての見え方・操作を確認する）。
 * 元のアカウントはセッションに記録しておき、いつでも戻れる。
 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  const { userId } = z.object({ userId: z.uuid() }).parse(await readJson(req));
  const target = await getUserById(userId);
  if (!target || target.status !== "active" || !target.isTestUser) throw notFound("切り替えられるテスト用ユーザーが見つかりません");
  const original = viewer.session.impersonatorId ?? viewer.id;
  const { token } = await createSession(target.id, {
    userAgent: req.headers.get("user-agent"),
    impersonatorId: target.id === original ? null : original,
  });
  const old = req.cookies.get(SESSION_COOKIE)?.value;
  if (old) await deleteSessionByToken(old);
  const res = json({ user: toMe(target) });
  setSessionCookie(req, res, token);
  return res;
});

/** デバッグ: 元のアカウントに戻る */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  if (!viewer.session.impersonatorId) throw badRequest("テスト用ユーザーに切り替えていません");
  const original = await getUserById(viewer.session.impersonatorId);
  if (!original || original.status !== "active") throw notFound("元のアカウントが見つかりません。ログインし直してください");
  const { token } = await createSession(original.id, { userAgent: req.headers.get("user-agent") });
  const old = req.cookies.get(SESSION_COOKIE)?.value;
  if (old) await deleteSessionByToken(old);
  const res = json({ user: toMe(original) });
  setSessionCookie(req, res, token);
  return res;
});
