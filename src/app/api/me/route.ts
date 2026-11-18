import type { NextRequest } from "next/server";
import { route, json, readJson, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { clearSessionCookie, getViewer, requireViewer } from "@/server/http/viewer";
import { verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE } from "@/server/auth/session";
import { deleteAccount, getUserById, toMe, updateProfile } from "@/server/services/users";
import { accountDeleteSchema, profileUpdateSchema } from "@/lib/validation";
import { env } from "@/server/env";
import { now } from "@/server/clock";
import { unreadCount } from "@/server/services/notifications";
import type { MeResponse } from "@/lib/types";

export const GET = route(async (req: NextRequest) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    // 無効なCookieが残っていたら消しておく（ログイン画面との往復を防ぐ）
    const res = json({ error: { code: "unauthorized", message: "ログインが必要です" } }, { status: 401 });
    if (req.cookies.get(SESSION_COOKIE)) clearSessionCookie(req, res);
    return res;
  }
  let impersonator: MeResponse["impersonator"] = null;
  if (viewer.session.impersonatorId) {
    const u = await getUserById(viewer.session.impersonatorId);
    if (u) impersonator = { id: u.id, handle: u.handle, displayName: u.displayName };
  }
  const body: MeResponse = {
    user: toMe(viewer),
    debugMode: env.debugMode,
    serverNow: (await now()).toISOString(),
    impersonator,
    unreadNotifications: await unreadCount(viewer.id),
  };
  return json(body);
});

export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const patch = profileUpdateSchema.parse(await readJson(req));
  const user = await updateProfile(viewer.id, patch);
  return json({ user: toMe(user) });
});

/** 退会（本人によるアカウント削除） */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { password } = accountDeleteSchema.parse(await readJson(req));
  if (!(await verifyPassword(password, viewer.passwordHash))) {
    throw badRequest("パスワードが違います", { fields: { password: "パスワードが違います" } });
  }
  await deleteAccount(viewer.id);
  const res = json({ ok: true });
  clearSessionCookie(req, res);
  return res;
});
