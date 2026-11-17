import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { notifications, posts, users, type NotificationRow } from "../db/schema";
import { mediaUrl } from "../storage";
import type { NotificationDTO, NotificationPage } from "@/lib/types";

type Notify = {
  userId: string;
  type: NotificationRow["type"];
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  data?: Record<string, unknown>;
  at?: Date;
};

/** お知らせを作る（自分自身の操作による通知は作らない） */
export async function notify(n: Notify) {
  if (n.actorId && n.actorId === n.userId) return;
  await db.insert(notifications).values({
    userId: n.userId,
    type: n.type,
    actorId: n.actorId ?? null,
    postId: n.postId ?? null,
    commentId: n.commentId ?? null,
    data: n.data ?? {},
    createdAt: n.at ?? new Date(),
  });
}

/** いいねを取り消したときなど、対応するお知らせを消す */
export async function removeNotification(where: { userId: string; type: NotificationRow["type"]; actorId: string; postId?: string }) {
  const conds = [
    eq(notifications.userId, where.userId),
    eq(notifications.type, where.type),
    eq(notifications.actorId, where.actorId),
  ];
  if (where.postId) conds.push(eq(notifications.postId, where.postId));
  await db.delete(notifications).where(and(...conds));
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

const PAGE = 30;

function encode(at: Date, id: string) {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}
function decode(c: string | null): { at: Date; id: string } | null {
  if (!c) return null;
  try {
    const [iso, id] = Buffer.from(c, "base64url").toString().split("|");
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : { at, id };
  } catch {
    return null;
  }
}

export async function listNotifications(userId: string, cursor: string | null): Promise<NotificationPage> {
  const c = decode(cursor);
  const before: SQL | undefined = c
    ? or(lt(notifications.createdAt, c.at), and(eq(notifications.createdAt, c.at), lt(notifications.id, c.id)))
    : undefined;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), before))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  const actorIds = Array.from(new Set(list.map((r) => r.actorId).filter((x): x is string => !!x)));
  const postIds = Array.from(new Set(list.map((r) => r.postId).filter((x): x is string => !!x)));
  const [actors, postRows] = await Promise.all([
    actorIds.length
      ? db
          .select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarKey: users.avatarKey })
          .from(users)
          .where(inArray(users.id, actorIds))
      : Promise.resolve([]),
    postIds.length
      ? db
          .select({ id: posts.id, imageKey: posts.imageKey, status: posts.status })
          .from(posts)
          .where(inArray(posts.id, postIds))
      : Promise.resolve([]),
  ]);
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  const postMap = new Map(postRows.map((p) => [p.id, p]));
  const items: NotificationDTO[] = list.map((r) => {
    const a = r.actorId ? actorMap.get(r.actorId) : undefined;
    const p = r.postId ? postMap.get(r.postId) : undefined;
    return {
      id: r.id,
      type: r.type,
      actor: a ? { id: a.id, handle: a.handle, displayName: a.displayName, avatarUrl: mediaUrl(a.avatarKey) } : null,
      postId: r.postId,
      postThumb: p && p.status === "visible" ? mediaUrl(`${p.imageKey}/sm.webp`) : null,
      data: r.data,
      read: !!r.readAt,
      createdAt: r.createdAt.toISOString(),
    };
  });
  const last = list[list.length - 1];
  return { items, nextCursor: rows.length > PAGE && last ? encode(last.createdAt, last.id) : null };
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
