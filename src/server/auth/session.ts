import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users, type SessionRow, type UserRow } from "../db/schema";
import { randomToken, sha256 } from "./tokens";

export const SESSION_COOKIE = "hk_session";
const DAY = 24 * 60 * 60 * 1000;
/** セッションの有効期間（使うたびに延長する） */
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_THRESHOLD_MS = 15 * DAY;

export async function createSession(
  userId: string,
  opts: { userAgent?: string | null; impersonatorId?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    userAgent: opts.userAgent?.slice(0, 300) ?? null,
    impersonatorId: opts.impersonatorId ?? null,
  });
  return { token, expiresAt };
}

/** トークンを検証し、有効ならセッションとユーザーを返す（期限が近ければ延長する） */
export async function validateSessionToken(token: string): Promise<{ session: SessionRow; user: UserRow } | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.status !== "active") {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    row.session.expiresAt = expiresAt;
  }
  return row;
}

export async function deleteSessionByToken(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function deleteUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** 期限切れセッションの掃除 */
export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
