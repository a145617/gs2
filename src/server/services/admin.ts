import { and, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, comments, posts, reports, users, warnings, type UserRow } from "../db/schema";
import { badRequest, notFound } from "../http/respond";
import { mediaUrl } from "../storage";
import { notify } from "./notifications";
import { decodeCursor, deletePost, encodeCursor, updatePost, type ViewerCtx } from "./posts";
import { deleteComment, editComment } from "./social";
import { deleteAccount, removeAvatar, updateProfile } from "./users";
import { escapeLike, normalizeForSearch } from "@/lib/search";
import type { ReportReason } from "@/lib/moderation";

// =============================================================================
// 管理者の操作。すべて操作の記録（audit_logs）を残す。
// =============================================================================

export async function audit(actorId: string, action: string, targetType: string, targetId: string | null, data: Record<string, unknown> = {}) {
  await db.insert(auditLogs).values({ actorId, action, targetType, targetId, data });
}

export async function adminStats() {
  const [[u], [p], [c], [r], [w]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.status, "active")),
    db.select({ n: sql<number>`count(*)::int` }).from(posts).where(ne(posts.status, "deleted")),
    db.select({ n: sql<number>`count(*)::int` }).from(comments).where(ne(comments.status, "deleted")),
    db.select({ n: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, "open")),
    db.select({ n: sql<number>`count(*)::int` }).from(posts).where(eq(posts.status, "hidden")),
  ]);
  return { users: u?.n ?? 0, posts: p?.n ?? 0, comments: c?.n ?? 0, openReports: r?.n ?? 0, hiddenPosts: w?.n ?? 0 };
}

// ------------------------------------------------------------------ 投稿
export async function adminEditPost(admin: ViewerCtx, postId: string, patch: { title?: string; caption?: string; tags?: string | string[] }, at: Date) {
  const post = await updatePost(admin, postId, patch, at, { asAdmin: true });
  await audit(admin.id, "post.edit", "post", postId, patch);
  if (post.author.id !== admin.id) await notify({ userId: post.author.id, type: "post_edited", postId, at });
  return post;
}

export async function adminSetPostStatus(admin: ViewerCtx, postId: string, status: "hidden" | "visible", reason: string) {
  if (!/^[0-9a-f-]{36}$/.test(postId)) throw notFound("投稿が見つかりませんでした");
  const [row] = await db
    .update(posts)
    .set({ status, hiddenReason: status === "hidden" ? reason || "admin" : null, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), ne(posts.status, "deleted")))
    .returning();
  if (!row) throw notFound("投稿が見つかりませんでした");
  await audit(admin.id, status === "hidden" ? "post.hide" : "post.restore", "post", postId, { reason });
  return row;
}

export async function adminDeletePost(admin: ViewerCtx, postId: string, reason: string) {
  const row = await deletePost(admin, postId, { asAdmin: true });
  await audit(admin.id, "post.delete", "post", postId, { reason, title: row.title });
  if (row.userId !== admin.id) await notify({ userId: row.userId, type: "post_removed", data: { reason, title: row.title } });
  return row;
}

// ------------------------------------------------------------------ コメント
export async function adminEditComment(admin: ViewerCtx, commentId: string, body: string, at: Date) {
  const c = await editComment(admin, commentId, body, at, { asAdmin: true });
  await audit(admin.id, "comment.edit", "comment", commentId, { body });
  if (c.author.id !== admin.id) await notify({ userId: c.author.id, type: "comment_edited", postId: c.postId, at });
  return c;
}

export async function adminDeleteComment(admin: ViewerCtx, commentId: string, reason: string) {
  const c = await deleteComment(admin, commentId, { asAdmin: true });
  await audit(admin.id, "comment.delete", "comment", commentId, { reason, body: c.body });
  if (c.userId !== admin.id) await notify({ userId: c.userId, type: "comment_removed", postId: c.postId, data: { reason } });
  return c;
}

export async function adminSetCommentStatus(admin: ViewerCtx, commentId: string, status: "hidden" | "visible") {
  if (!/^[0-9a-f-]{36}$/.test(commentId)) throw notFound("コメントが見つかりませんでした");
  const current = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
  if (!current || current.status === "deleted") throw notFound("コメントが見つかりませんでした");
  if (current.status === status) return current;
  const [row] = await db
    .update(comments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.status, current.status)))
    .returning();
  if (!row) return current;
  await db
    .update(posts)
    .set({ commentCount: sql`greatest(${posts.commentCount} ${status === "hidden" ? sql`- 1` : sql`+ 1`}, 0)` })
    .where(eq(posts.id, row.postId));
  await audit(admin.id, status === "hidden" ? "comment.hide" : "comment.restore", "comment", commentId);
  return row;
}

// ------------------------------------------------------------------ 一覧
const PAGE = 30;

export async function adminListPosts(q: string, status: string | null, cursor: string | null) {
  const c = decodeCursor(cursor);
  const conds: SQL[] = [ne(posts.status, "deleted")];
  if (status === "hidden" || status === "visible") conds.push(eq(posts.status, status));
  if (status === "reported") conds.push(sql`${posts.reportCount} > 0`);
  const term = normalizeForSearch(q);
  if (term) conds.push(sql`${posts.searchText} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`);
  if (c) conds.push(or(lt(posts.createdAt, c.createdAt), and(eq(posts.createdAt, c.createdAt), lt(posts.id, c.id)))!);
  const rows = await db
    .select({ p: posts, u: { handle: users.handle, displayName: users.displayName, status: users.status } })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .where(and(...conds))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  const last = list[list.length - 1];
  return {
    items: list.map(({ p, u }) => ({
      id: p.id,
      title: p.title,
      caption: p.caption,
      thumb: mediaUrl(`${p.imageKey}/sm.webp`),
      status: p.status,
      hiddenReason: p.hiddenReason,
      kind: p.kind,
      reportCount: p.reportCount,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      createdAt: p.createdAt.toISOString(),
      author: { handle: u.handle, displayName: u.displayName, status: u.status },
    })),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.p.createdAt, last.p.id) : null,
  };
}

export async function adminListComments(q: string, cursor: string | null) {
  const c = decodeCursor(cursor);
  const conds: SQL[] = [ne(comments.status, "deleted")];
  if (q.trim()) conds.push(ilike(comments.body, `%${escapeLike(q.trim())}%`));
  if (c) conds.push(or(lt(comments.createdAt, c.createdAt), and(eq(comments.createdAt, c.createdAt), lt(comments.id, c.id)))!);
  const rows = await db
    .select({ c: comments, u: { handle: users.handle, displayName: users.displayName }, postTitle: posts.title })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(and(...conds))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  const last = list[list.length - 1];
  return {
    items: list.map(({ c: cm, u, postTitle }) => ({
      id: cm.id,
      postId: cm.postId,
      postTitle,
      body: cm.body,
      status: cm.status,
      createdAt: cm.createdAt.toISOString(),
      author: u,
    })),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.c.createdAt, last.c.id) : null,
  };
}

export async function adminListUsers(q: string, cursor: string | null) {
  const c = decodeCursor(cursor);
  const conds: SQL[] = [eq(users.status, "active")];
  const term = q.trim().replace(/^@/, "");
  if (term) {
    const like = `%${escapeLike(term)}%`;
    conds.push(or(ilike(users.displayName, like), ilike(users.handle, like), ilike(users.email, like))!);
  }
  if (c) conds.push(or(lt(users.createdAt, c.createdAt), and(eq(users.createdAt, c.createdAt), lt(users.id, c.id)))!);
  const rows = await db.select().from(users).where(and(...conds)).orderBy(desc(users.createdAt), desc(users.id)).limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  const ids = list.map((u) => u.id);
  const [warnCounts, reportCounts] = ids.length
    ? await Promise.all([
        db
          .select({ userId: warnings.userId, n: sql<number>`count(*)::int` })
          .from(warnings)
          .where(inArray(warnings.userId, ids))
          .groupBy(warnings.userId),
        db
          .select({ userId: reports.targetUserId, n: sql<number>`count(*)::int` })
          .from(reports)
          .where(and(inArray(reports.targetUserId, ids), eq(reports.status, "open")))
          .groupBy(reports.targetUserId),
      ])
    : [[], []];
  const wMap = new Map(warnCounts.map((w) => [w.userId, w.n]));
  const rMap = new Map(reportCounts.map((r) => [r.userId, r.n]));
  const last = list[list.length - 1];
  return {
    items: list.map((u) => ({
      ...adminUserSummary(u),
      warnings: wMap.get(u.id) ?? 0,
      openReports: rMap.get(u.id) ?? 0,
    })),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

function adminUserSummary(u: UserRow) {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    email: u.email,
    avatarUrl: mediaUrl(u.avatarKey),
    bio: u.bio,
    role: u.role,
    status: u.status,
    isTestUser: u.isTestUser,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function adminGetUser(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw notFound("ユーザーが見つかりませんでした");
  const [warns, [pc]] = await Promise.all([
    db.select().from(warnings).where(eq(warnings.userId, userId)).orderBy(desc(warnings.createdAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.userId, userId), ne(posts.status, "deleted"))),
  ]);
  return {
    user: adminUserSummary(u),
    postCount: pc?.n ?? 0,
    warnings: warns.map((w) => ({
      id: w.id,
      message: w.message,
      createdAt: w.createdAt.toISOString(),
      acknowledgedAt: w.acknowledgedAt?.toISOString() ?? null,
    })),
  };
}

// ------------------------------------------------------------------ アカウント
/** アカウントへの警告（本人が確認するまで画面に表示される） */
export async function warnUser(admin: ViewerCtx, userId: string, message: string) {
  const text = message.trim();
  if (!text) throw badRequest("警告の内容を入力してください");
  const u = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.status, "active")) });
  if (!u) throw notFound("ユーザーが見つかりませんでした");
  const [w] = await db.insert(warnings).values({ userId, adminId: admin.id, message: text.slice(0, 500) }).returning();
  await notify({ userId, type: "warning", data: { message: text.slice(0, 120) } });
  await audit(admin.id, "user.warn", "user", userId, { message: text });
  return w;
}

/** アカウントの削除（管理者）。投稿も削除し、画像を消す */
export async function adminDeleteUser(admin: ViewerCtx, userId: string, reason: string) {
  if (userId === admin.id) throw badRequest("自分自身のアカウントは管理画面から削除できません");
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || u.status === "deleted") throw notFound("ユーザーが見つかりませんでした");
  const userPosts = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.userId, userId), ne(posts.status, "deleted")));
  // 1件ずつ削除してハッシュタグの件数や画像も正しく片付ける
  for (const p of userPosts) await deletePost(admin, p.id, { asAdmin: true });
  // 他の人の投稿に付けたコメントを消し、コメント数を合わせる
  await db.execute(sql`
    UPDATE ${posts} SET comment_count = greatest(${posts.commentCount} - sub.n, 0)
    FROM (SELECT post_id, count(*)::int AS n FROM ${comments} WHERE user_id = ${userId} AND status = 'visible' GROUP BY post_id) sub
    WHERE ${posts.id} = sub.post_id
  `);
  await db.update(comments).set({ status: "deleted", updatedAt: new Date() }).where(eq(comments.userId, userId));
  await deleteAccount(userId);
  await audit(admin.id, "user.delete", "user", userId, { reason, handle: u.handle, displayName: u.displayName, posts: userPosts.length });
}

export async function setUserRole(admin: ViewerCtx, userId: string, role: "user" | "admin") {
  if (userId === admin.id && role !== "admin") throw badRequest("自分自身の管理者権限は外せません");
  const [row] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
  if (!row) throw notFound("ユーザーが見つかりませんでした");
  await audit(admin.id, "user.role", "user", userId, { role });
  return row;
}

/** 不適切なユーザー名・自己紹介・アイコンを管理者が直す */
export async function adminEditProfile(admin: ViewerCtx, userId: string, patch: { displayName?: string; bio?: string; removeAvatar?: boolean }) {
  if (patch.displayName !== undefined || patch.bio !== undefined) {
    await updateProfile(userId, { displayName: patch.displayName, bio: patch.bio });
  }
  if (patch.removeAvatar) await removeAvatar(userId);
  await audit(admin.id, "user.profile", "user", userId, patch);
}

// ------------------------------------------------------------------ 通報
export async function adminListReports(status: "open" | "resolved" | "dismissed", cursor: string | null) {
  const c = decodeCursor(cursor);
  const conds: SQL[] = [eq(reports.status, status)];
  if (c) conds.push(or(lt(reports.createdAt, c.createdAt), and(eq(reports.createdAt, c.createdAt), lt(reports.id, c.id)))!);
  const rows = await db
    .select({ r: reports, reporter: { handle: users.handle, displayName: users.displayName } })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(and(...conds))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  // 通報された内容のプレビュー
  const postIds = list.filter((x) => x.r.targetType === "post").map((x) => x.r.targetId);
  const commentIds = list.filter((x) => x.r.targetType === "comment").map((x) => x.r.targetId);
  const userIds = list.map((x) => x.r.targetUserId).filter((x): x is string => !!x);
  const [ps, cs, us] = await Promise.all([
    postIds.length ? db.select().from(posts).where(inArray(posts.id, postIds)) : Promise.resolve([]),
    commentIds.length ? db.select().from(comments).where(inArray(comments.id, commentIds)) : Promise.resolve([]),
    userIds.length ? db.select().from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
  ]);
  const pMap = new Map(ps.map((p) => [p.id, p]));
  const cMap = new Map(cs.map((x) => [x.id, x]));
  const uMap = new Map(us.map((u) => [u.id, u]));
  const last = list[list.length - 1];
  return {
    items: list.map(({ r, reporter }) => {
      const p = r.targetType === "post" ? pMap.get(r.targetId) : undefined;
      const cm = r.targetType === "comment" ? cMap.get(r.targetId) : undefined;
      const tu = r.targetUserId ? uMap.get(r.targetUserId) : undefined;
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason as ReportReason,
        detail: r.detail,
        status: r.status,
        resolution: r.resolution,
        createdAt: r.createdAt.toISOString(),
        reporter,
        target: {
          title: p?.title ?? null,
          thumb: p ? mediaUrl(`${p.imageKey}/sm.webp`) : null,
          postStatus: p?.status ?? null,
          commentBody: cm?.body ?? null,
          commentStatus: cm?.status ?? null,
          postId: p?.id ?? cm?.postId ?? null,
          user: tu ? { id: tu.id, handle: tu.handle, displayName: tu.displayName, status: tu.status } : null,
        },
      };
    }),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.r.createdAt, last.r.id) : null,
  };
}

/**
 * 通報を処理する。対象への操作（非表示・削除・復元）を行い、同じ対象への未対応の通報もまとめて閉じる。
 */
export async function resolveReport(
  admin: ViewerCtx,
  reportId: string,
  action: "dismiss" | "hide" | "delete" | "restore",
  note: string,
) {
  if (!/^[0-9a-f-]{36}$/.test(reportId)) throw notFound("通報が見つかりませんでした");
  const r = await db.query.reports.findFirst({ where: eq(reports.id, reportId) });
  if (!r) throw notFound("通報が見つかりませんでした");
  if (r.targetType === "user" && (action === "hide" || action === "restore")) {
    throw badRequest("アカウントへの通報は「問題なし」か「アカウントを削除」で処理してください（警告はアカウントの画面から送れます）");
  }
  if (r.targetType === "post") {
    if (action === "hide") await adminSetPostStatus(admin, r.targetId, "hidden", "reports");
    if (action === "restore") await adminSetPostStatus(admin, r.targetId, "visible", "");
    if (action === "delete") await adminDeletePost(admin, r.targetId, note || "通報によるガイドライン違反");
    // 問題なしと判断したら、通報の件数を戻す（「通報あり」の絞り込みから外れる）
    if (action === "dismiss" || action === "restore") await db.update(posts).set({ reportCount: 0 }).where(eq(posts.id, r.targetId));
  } else if (r.targetType === "comment") {
    if (action === "hide") await adminSetCommentStatus(admin, r.targetId, "hidden");
    if (action === "restore") await adminSetCommentStatus(admin, r.targetId, "visible");
    if (action === "delete") await adminDeleteComment(admin, r.targetId, note || "通報によるガイドライン違反");
  } else if (action === "delete" && r.targetUserId) {
    await adminDeleteUser(admin, r.targetUserId, note || "通報によるガイドライン違反");
  }
  const status = action === "dismiss" || action === "restore" ? "dismissed" : "resolved";
  const closed = await db
    .update(reports)
    .set({ status, resolution: note || action, resolvedById: admin.id, resolvedAt: new Date() })
    .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")))
    .returning({ reporterId: reports.reporterId });
  for (const c of closed) await notify({ userId: c.reporterId, type: "report_resolved", data: { action } });
  await audit(admin.id, `report.${action}`, r.targetType, r.targetId, { reportId, note, closed: closed.length });
  return { closed: closed.length };
}

// ------------------------------------------------------------------ 警告（本人側）
export async function pendingWarnings(userId: string) {
  const rows = await db
    .select()
    .from(warnings)
    .where(and(eq(warnings.userId, userId), isNull(warnings.acknowledgedAt)))
    .orderBy(desc(warnings.createdAt));
  return rows.map((w) => ({ id: w.id, message: w.message, createdAt: w.createdAt.toISOString() }));
}

export async function acknowledgeWarning(userId: string, warningId: string) {
  await db
    .update(warnings)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(warnings.id, warningId), eq(warnings.userId, userId), isNull(warnings.acknowledgedAt)));
}

// ------------------------------------------------------------------ 操作の記録
export async function listAuditLogs(cursor: string | null) {
  const c = decodeCursor(cursor);
  const where = c ? or(lt(auditLogs.createdAt, c.createdAt), and(eq(auditLogs.createdAt, c.createdAt), lt(auditLogs.id, c.id))) : undefined;
  const rows = await db
    .select({ l: auditLogs, actor: { handle: users.handle, displayName: users.displayName } })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE);
  const last = list[list.length - 1];
  return {
    items: list.map(({ l, actor }) => ({
      id: l.id,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      data: l.data,
      createdAt: l.createdAt.toISOString(),
      actor,
    })),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.l.createdAt, last.l.id) : null,
  };
}
