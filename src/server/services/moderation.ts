import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { comments, mutes, posts, reports, users } from "../db/schema";
import { badRequest, conflict, notFound } from "../http/respond";
import { getSetting, SETTING_KEYS } from "../settings";
import { mediaUrl } from "../storage";
import type { ViewerCtx } from "./posts";
import type { ReportInput } from "@/lib/moderation";
import type { UserListItem } from "@/lib/types";

// ------------------------------------------------------------------ ミュート
/** 特定のユーザーの投稿・コメントを表示しないようにする */
export async function mute(viewer: ViewerCtx, targetId: string) {
  if (targetId === viewer.id) throw badRequest("自分自身はミュートできません");
  await db.insert(mutes).values({ userId: viewer.id, mutedUserId: targetId }).onConflictDoNothing();
  return { muted: true };
}

export async function unmute(viewer: ViewerCtx, targetId: string) {
  await db.delete(mutes).where(and(eq(mutes.userId, viewer.id), eq(mutes.mutedUserId, targetId)));
  return { muted: false };
}

export async function isMuted(userId: string, targetId: string): Promise<boolean> {
  const row = await db.query.mutes.findFirst({ where: and(eq(mutes.userId, userId), eq(mutes.mutedUserId, targetId)) });
  return !!row;
}

/** 閲覧者がミュートしているユーザーのID */
export async function mutedUserIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: mutes.mutedUserId }).from(mutes).where(eq(mutes.userId, userId));
  return rows.map((r) => r.id);
}

export async function listMutes(viewer: ViewerCtx): Promise<UserListItem[]> {
  const rows = await db
    .select({ u: users })
    .from(mutes)
    .innerJoin(users, eq(users.id, mutes.mutedUserId))
    .where(and(eq(mutes.userId, viewer.id), eq(users.status, "active")))
    .orderBy(desc(mutes.createdAt));
  return rows.map(({ u }) => ({
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: mediaUrl(u.avatarKey),
    bio: u.bio,
    following: false,
  }));
}

// ------------------------------------------------------------------ 通報
export const DEFAULT_AUTO_HIDE = 3;

/**
 * 不適切な投稿・コメント・ユーザーを通報する。
 * 同じ投稿（コメント）への未対応の通報が一定数集まると、管理者の確認まで自動で非表示にする。
 */
export async function createReport(viewer: ViewerCtx, input: ReportInput) {
  let targetUserId: string;
  if (input.targetType === "post") {
    const p = await db.query.posts.findFirst({ where: eq(posts.id, input.targetId) });
    if (!p || p.status === "deleted") throw notFound("投稿が見つかりませんでした");
    targetUserId = p.userId;
  } else if (input.targetType === "comment") {
    const c = await db.query.comments.findFirst({ where: eq(comments.id, input.targetId) });
    if (!c || c.status === "deleted") throw notFound("コメントが見つかりませんでした");
    targetUserId = c.userId;
  } else {
    const u = await db.query.users.findFirst({ where: and(eq(users.id, input.targetId), eq(users.status, "active")) });
    if (!u) throw notFound("ユーザーが見つかりませんでした");
    targetUserId = u.id;
  }
  if (targetUserId === viewer.id) throw badRequest("自分自身の内容は通報できません");

  const inserted = await db
    .insert(reports)
    .values({
      reporterId: viewer.id,
      targetType: input.targetType,
      targetId: input.targetId,
      targetUserId,
      reason: input.reason,
      detail: input.detail,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) throw conflict("すでに通報済みです。ご協力ありがとうございます", "already_reported");

  let autoHidden = false;
  if (input.targetType === "post" || input.targetType === "comment") {
    const threshold = await getSetting<number>(SETTING_KEYS.autoHideReports, DEFAULT_AUTO_HIDE);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, "open")));
    if (input.targetType === "post") {
      await db.update(posts).set({ reportCount: sql`${posts.reportCount} + 1` }).where(eq(posts.id, input.targetId));
      if (threshold > 0 && n >= threshold) {
        const hidden = await db
          .update(posts)
          .set({ status: "hidden", hiddenReason: "reports" })
          .where(and(eq(posts.id, input.targetId), eq(posts.status, "visible")))
          .returning({ id: posts.id });
        autoHidden = hidden.length > 0;
      }
    } else if (threshold > 0 && n >= threshold) {
      const hidden = await db
        .update(comments)
        .set({ status: "hidden" })
        .where(and(eq(comments.id, input.targetId), eq(comments.status, "visible")))
        .returning({ id: comments.id, postId: comments.postId });
      if (hidden.length > 0) {
        autoHidden = true;
        await db
          .update(posts)
          .set({ commentCount: sql`greatest(${posts.commentCount} - 1, 0)` })
          .where(eq(posts.id, hidden[0].postId));
      }
    }
  }
  return { report: inserted[0], autoHidden };
}
