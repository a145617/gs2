import { and, asc, desc, eq, gt, inArray, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { bookmarks, comments, follows, likes, posts, users, type CommentRow } from "../db/schema";
import { badRequest, forbidden, notFound } from "../http/respond";
import { mediaUrl } from "../storage";
import { notify, removeNotification } from "./notifications";
import { decodeCursor, encodeCursor, getPost, hydratePosts, type ViewerCtx } from "./posts";
import type { CommentDTO, CommentPage, PostPage, UserListItem, UserListPage } from "@/lib/types";

// ------------------------------------------------------------------ いいね
/** 閲覧できる（ゲートで隠れていない）投稿かを確認する */
async function requireAccessible(viewer: ViewerCtx, postId: string, at: Date) {
  const post = await getPost(viewer, postId, at);
  if (post.locked) throw forbidden("今日のお題に投稿すると操作できます");
  if (post.status !== "visible") throw forbidden("この投稿には操作できません");
  return post;
}

export async function likePost(viewer: ViewerCtx, postId: string, at: Date) {
  const post = await requireAccessible(viewer, postId, at);
  const inserted = await db
    .insert(likes)
    .values({ userId: viewer.id, postId, createdAt: at })
    .onConflictDoNothing()
    .returning({ postId: likes.postId });
  if (inserted.length > 0) {
    await db.update(posts).set({ likeCount: sql`${posts.likeCount} + 1` }).where(eq(posts.id, postId));
    await notify({ userId: post.author.id, type: "like", actorId: viewer.id, postId, at });
  }
  return likeState(viewer.id, postId);
}

export async function unlikePost(viewer: ViewerCtx, postId: string) {
  const deleted = await db
    .delete(likes)
    .where(and(eq(likes.userId, viewer.id), eq(likes.postId, postId)))
    .returning({ postId: likes.postId });
  if (deleted.length > 0) {
    const [p] = await db
      .update(posts)
      .set({ likeCount: sql`greatest(${posts.likeCount} - 1, 0)` })
      .where(eq(posts.id, postId))
      .returning({ userId: posts.userId });
    if (p) await removeNotification({ userId: p.userId, type: "like", actorId: viewer.id, postId });
  }
  return likeState(viewer.id, postId);
}

async function likeState(userId: string, postId: string) {
  const [p] = await db.select({ likeCount: posts.likeCount }).from(posts).where(eq(posts.id, postId));
  const mine = await db.query.likes.findFirst({ where: and(eq(likes.userId, userId), eq(likes.postId, postId)) });
  return { liked: !!mine, count: p?.likeCount ?? 0 };
}

// ------------------------------------------------------------ ブックマーク
export async function bookmarkPost(viewer: ViewerCtx, postId: string, at: Date) {
  await requireAccessible(viewer, postId, at);
  const inserted = await db
    .insert(bookmarks)
    .values({ userId: viewer.id, postId, createdAt: at })
    .onConflictDoNothing()
    .returning({ postId: bookmarks.postId });
  if (inserted.length > 0) {
    await db.update(posts).set({ bookmarkCount: sql`${posts.bookmarkCount} + 1` }).where(eq(posts.id, postId));
  }
  return { bookmarked: true };
}

export async function unbookmarkPost(viewer: ViewerCtx, postId: string) {
  const deleted = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, viewer.id), eq(bookmarks.postId, postId)))
    .returning({ postId: bookmarks.postId });
  if (deleted.length > 0) {
    await db
      .update(posts)
      .set({ bookmarkCount: sql`greatest(${posts.bookmarkCount} - 1, 0)` })
      .where(eq(posts.id, postId));
  }
  return { bookmarked: false };
}

/** 自分のブックマーク（保存した順） */
export async function listBookmarks(viewer: ViewerCtx, at: Date, cursor: string | null): Promise<PostPage> {
  const c = decodeCursor(cursor);
  const before: SQL | undefined = c
    ? or(lt(bookmarks.createdAt, c.createdAt), and(eq(bookmarks.createdAt, c.createdAt), lt(bookmarks.postId, c.id)))
    : undefined;
  const rows = await db
    .select({ post: posts, savedAt: bookmarks.createdAt })
    .from(bookmarks)
    .innerJoin(posts, eq(posts.id, bookmarks.postId))
    .innerJoin(users, eq(users.id, posts.userId))
    .where(and(eq(bookmarks.userId, viewer.id), eq(posts.status, "visible"), eq(users.status, "active"), before))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.postId))
    .limit(25);
  const list = rows.slice(0, 24);
  const items = await hydratePosts(list.map((r) => r.post), viewer, at);
  const last = list[list.length - 1];
  return { items, nextCursor: rows.length > 24 && last ? encodeCursor(last.savedAt, last.post.id) : null };
}

// ------------------------------------------------------------------ コメント
export const COMMENT_MAX = 300;

function toCommentDTO(
  c: CommentRow,
  author: { id: string; handle: string; displayName: string; avatarKey: string | null } | undefined,
  viewer: ViewerCtx,
  postOwnerId: string,
): CommentDTO {
  const isMine = c.userId === viewer.id;
  return {
    id: c.id,
    postId: c.postId,
    author: {
      id: c.userId,
      handle: author?.handle ?? "",
      displayName: author?.displayName ?? "",
      avatarUrl: mediaUrl(author?.avatarKey ?? null),
    },
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    editedByAdmin: !!c.editedByAdminAt,
    status: c.status,
    viewer: {
      isMine,
      canEdit: isMine,
      // 自分のコメント、自分の投稿へのコメントは削除できる（管理者の操作は管理画面から）
      canDelete: isMine || postOwnerId === viewer.id,
    },
  };
}

export async function addComment(viewer: ViewerCtx, postId: string, body: string, at: Date): Promise<CommentDTO> {
  const post = await requireAccessible(viewer, postId, at);
  const text = body.trim();
  if (!text) throw badRequest("コメントを入力してください");
  if (text.length > COMMENT_MAX) throw badRequest(`コメントは${COMMENT_MAX}文字以内にしてください`);
  const [row] = await db
    .insert(comments)
    .values({ postId, userId: viewer.id, body: text, createdAt: at, updatedAt: at })
    .returning();
  await db.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, postId));
  await notify({ userId: post.author.id, type: "comment", actorId: viewer.id, postId, commentId: row.id, at, data: { excerpt: text.slice(0, 60) } });
  const author = await db.query.users.findFirst({ where: eq(users.id, viewer.id) });
  return toCommentDTO(row, author, viewer, post.author.id);
}

/** 投稿のコメント（古い順） */
export async function listComments(
  viewer: ViewerCtx,
  postId: string,
  at: Date,
  cursor: string | null,
  opts: { excludeUserIds?: string[] } = {},
): Promise<CommentPage> {
  const post = await getPost(viewer, postId, at);
  if (post.locked) return { items: [], nextCursor: null, total: 0 };
  const c = decodeCursor(cursor);
  const after: SQL | undefined = c
    ? or(gt(comments.createdAt, c.createdAt), and(eq(comments.createdAt, c.createdAt), gt(comments.id, c.id)))
    : undefined;
  const statusCond = viewer.role === "admin" ? ne(comments.status, "deleted") : eq(comments.status, "visible");
  const muteCond =
    opts.excludeUserIds && opts.excludeUserIds.length > 0
      ? notInArray(comments.userId, opts.excludeUserIds)
      : undefined;
  const rows = await db
    .select({ c: comments, u: { id: users.id, handle: users.handle, displayName: users.displayName, avatarKey: users.avatarKey } })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.postId, postId), statusCond, eq(users.status, "active"), after, muteCond))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(51);
  const list = rows.slice(0, 50);
  const last = list[list.length - 1];
  return {
    items: list.map((r) => toCommentDTO(r.c, r.u, viewer, post.author.id)),
    nextCursor: rows.length > 50 && last ? encodeCursor(last.c.createdAt, last.c.id) : null,
    total: post.counts.comments,
  };
}

async function loadComment(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("コメントが見つかりませんでした");
  const row = await db.query.comments.findFirst({ where: eq(comments.id, id) });
  if (!row || row.status === "deleted") throw notFound("コメントが見つかりませんでした");
  return row;
}

export async function editComment(
  viewer: ViewerCtx,
  id: string,
  body: string,
  at: Date,
  opts: { asAdmin?: boolean } = {},
): Promise<CommentDTO> {
  const row = await loadComment(id);
  const isOwner = row.userId === viewer.id;
  if (!isOwner && !(opts.asAdmin && viewer.role === "admin")) throw forbidden("このコメントは編集できません");
  const text = body.trim();
  if (!text) throw badRequest("コメントを入力してください");
  if (text.length > COMMENT_MAX) throw badRequest(`コメントは${COMMENT_MAX}文字以内にしてください`);
  const [u] = await db
    .update(comments)
    .set({ body: text, updatedAt: at, ...(isOwner && !opts.asAdmin ? { editedAt: at } : { editedByAdminAt: at }) })
    .where(eq(comments.id, id))
    .returning();
  const post = await db.query.posts.findFirst({ where: eq(posts.id, row.postId), columns: { userId: true } });
  const author = await db.query.users.findFirst({ where: eq(users.id, u.userId) });
  return toCommentDTO(u, author, viewer, post?.userId ?? "");
}

export async function deleteComment(viewer: ViewerCtx, id: string, opts: { asAdmin?: boolean } = {}): Promise<CommentRow> {
  const row = await loadComment(id);
  const post = await db.query.posts.findFirst({ where: eq(posts.id, row.postId), columns: { userId: true } });
  const allowed =
    row.userId === viewer.id || post?.userId === viewer.id || (opts.asAdmin === true && viewer.role === "admin");
  if (!allowed) throw forbidden("このコメントは削除できません");
  const [d] = await db
    .update(comments)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(comments.id, id))
    .returning();
  if (row.status === "visible") {
    await db.update(posts).set({ commentCount: sql`greatest(${posts.commentCount} - 1, 0)` }).where(eq(posts.id, row.postId));
  }
  return d;
}

// ------------------------------------------------------------------ フォロー
export async function follow(viewer: ViewerCtx, targetId: string, at: Date) {
  if (targetId === viewer.id) throw badRequest("自分自身はフォローできません");
  const target = await db.query.users.findFirst({ where: and(eq(users.id, targetId), eq(users.status, "active")) });
  if (!target) throw notFound("ユーザーが見つかりませんでした");
  const inserted = await db
    .insert(follows)
    .values({ followerId: viewer.id, followeeId: targetId, createdAt: at })
    .onConflictDoNothing()
    .returning({ followeeId: follows.followeeId });
  if (inserted.length > 0) await notify({ userId: targetId, type: "follow", actorId: viewer.id, at });
  return { following: true };
}

export async function unfollow(viewer: ViewerCtx, targetId: string) {
  const deleted = await db
    .delete(follows)
    .where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, targetId)))
    .returning({ followeeId: follows.followeeId });
  if (deleted.length > 0) await removeNotification({ userId: targetId, type: "follow", actorId: viewer.id });
  return { following: false };
}

export async function followState(viewerId: string, targetId: string) {
  const [a, b] = await Promise.all([
    db.query.follows.findFirst({ where: and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)) }),
    db.query.follows.findFirst({ where: and(eq(follows.followerId, targetId), eq(follows.followeeId, viewerId)) }),
  ]);
  return { following: !!a, followsMe: !!b };
}

export async function profileCounts(userId: string) {
  const [[p], [followers], [following]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.status, "visible"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followerId))
      .where(and(eq(follows.followeeId, userId), eq(users.status, "active"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followeeId))
      .where(and(eq(follows.followerId, userId), eq(users.status, "active"))),
  ]);
  return { posts: p?.n ?? 0, followers: followers?.n ?? 0, following: following?.n ?? 0 };
}

/** フォロワー / フォロー中の一覧 */
export async function listFollowUsers(
  viewer: ViewerCtx,
  userId: string,
  kind: "followers" | "following",
  cursor: string | null,
): Promise<UserListPage> {
  const c = decodeCursor(cursor);
  const otherCol = kind === "followers" ? follows.followerId : follows.followeeId;
  const selfCol = kind === "followers" ? follows.followeeId : follows.followerId;
  const before: SQL | undefined = c
    ? or(lt(follows.createdAt, c.createdAt), and(eq(follows.createdAt, c.createdAt), lt(otherCol, c.id)))
    : undefined;
  const rows = await db
    .select({ u: users, at: follows.createdAt })
    .from(follows)
    .innerJoin(users, eq(users.id, otherCol))
    .where(and(eq(selfCol, userId), eq(users.status, "active"), before))
    .orderBy(desc(follows.createdAt), desc(otherCol))
    .limit(31);
  const list = rows.slice(0, 30);
  const ids = list.map((r) => r.u.id);
  const mine = ids.length
    ? await db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, viewer.id), inArray(follows.followeeId, ids)))
    : [];
  const mineSet = new Set(mine.map((m) => m.id));
  const items: UserListItem[] = list.map((r) => ({
    id: r.u.id,
    handle: r.u.handle,
    displayName: r.u.displayName,
    avatarUrl: mediaUrl(r.u.avatarKey),
    bio: r.u.bio,
    following: mineSet.has(r.u.id),
  }));
  const last = list[list.length - 1];
  return { items, nextCursor: rows.length > 30 && last ? encodeCursor(last.at, last.u.id) : null };
}

/** 閲覧者がフォローしているユーザーのID */
export async function followingIds(userId: string): Promise<string[]> {
  const rows = await db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, userId));
  return rows.map((r) => r.id);
}
