import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { hashtags, postHashtags, posts, themes, users, type PostRow } from "../db/schema";
import { conflict, forbidden, notFound, tooMany, badRequest } from "../http/respond";
import { deleteObjects, mediaUrl, putObject } from "../storage";
import { processPostImage, type ProcessedPostImage } from "../images";
import { randomId } from "../auth/tokens";
import { getSetting, SETTING_KEYS } from "../settings";
import { getCurrentTheme, toThemeDTO } from "./themes";
import { collectTags } from "@/lib/hashtags";
import type { PhotoMeta } from "@/lib/photo-meta";
import type { PostDTO, PostPage } from "@/lib/types";

export type ViewerCtx = { id: string; role: "user" | "admin" };

const VARIANTS = ["lg", "md", "sm"] as const;
const imageUrl = (key: string, v: (typeof VARIANTS)[number]) => mediaUrl(`${key}/${v}.webp`)!;

// ------------------------------------------------------------------ カーソル
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function beforeCursor(cursor: { createdAt: Date; id: string } | null): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(posts.createdAt, cursor.createdAt),
    and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
  );
}

// ------------------------------------------------------------ 閲覧ゲート
/** 閲覧者が指定のお題に投稿済みか */
export async function hasPostedToTheme(userId: string, themeId: string): Promise<boolean> {
  const row = await db.query.posts.findFirst({
    where: and(eq(posts.userId, userId), eq(posts.themeId, themeId), ne(posts.status, "deleted")),
    columns: { id: true },
  });
  return !!row;
}

export async function countPostsForTheme(themeId: string, userId?: string): Promise<number> {
  const conds = [eq(posts.themeId, themeId), eq(posts.status, "visible")];
  if (userId) conds.push(eq(posts.userId, userId));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(...conds));
  return row?.n ?? 0;
}

export type GateInfo = { currentThemeId: string; viewerPostedCurrent: boolean };

export async function getGateInfo(viewer: ViewerCtx, at: Date): Promise<GateInfo> {
  const theme = await getCurrentTheme(at);
  const viewerPostedCurrent = await hasPostedToTheme(viewer.id, theme.id);
  return { currentThemeId: theme.id, viewerPostedCurrent };
}

/**
 * 「投稿後、ほかのユーザーの投稿も閲覧することが出来る」:
 * 今日のお題への他人の投稿は、自分がそのお題に投稿するまで中身を見せない。
 */
export function isLocked(row: Pick<PostRow, "kind" | "themeId" | "userId">, viewer: ViewerCtx, gate: GateInfo) {
  return (
    row.kind === "theme" &&
    row.themeId === gate.currentThemeId &&
    row.userId !== viewer.id &&
    !gate.viewerPostedCurrent &&
    viewer.role !== "admin"
  );
}

// ------------------------------------------------------------ DTO 変換
type HydrateExtras = {
  liked?: Set<string>;
  bookmarked?: Set<string>;
};

/** 投稿の行を、作者・タグ・お題・閲覧者の状態を含む表示用データにする */
export async function hydratePosts(
  rows: PostRow[],
  viewer: ViewerCtx,
  at: Date,
  gate?: GateInfo,
  extras: HydrateExtras = {},
): Promise<PostDTO[]> {
  if (rows.length === 0) return [];
  const g = gate ?? (await getGateInfo(viewer, at));
  const ids = rows.map((r) => r.id);
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const themeIds = Array.from(new Set(rows.map((r) => r.themeId).filter((x): x is string => !!x)));

  const [authorRows, tagRows, themeRows, liked, bookmarked] = await Promise.all([
    db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
      })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({ postId: postHashtags.postId, name: hashtags.name })
      .from(postHashtags)
      .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
      .where(inArray(postHashtags.postId, ids)),
    themeIds.length ? db.select().from(themes).where(inArray(themes.id, themeIds)) : Promise.resolve([]),
    extras.liked ?? loadViewerSet(),
    extras.bookmarked ?? loadViewerSet(),
  ]);

  const authors = new Map(authorRows.map((a) => [a.id, a]));
  const tagsByPost = new Map<string, string[]>();
  for (const t of tagRows) tagsByPost.set(t.postId, [...(tagsByPost.get(t.postId) ?? []), t.name]);
  const themeMap = new Map(themeRows.map((t) => [t.id, toThemeDTO(t, at)]));

  return rows.map((r) => {
    const locked = isLocked(r, viewer, g);
    const a = authors.get(r.userId);
    const theme = r.themeId ? themeMap.get(r.themeId) : undefined;
    const isMine = r.userId === viewer.id;
    return {
      id: r.id,
      kind: r.kind,
      author: {
        id: r.userId,
        handle: a?.handle ?? "",
        displayName: a?.displayName ?? "",
        avatarUrl: mediaUrl(a?.avatarKey),
      },
      locked,
      placeholder: r.placeholder,
      image: locked
        ? null
        : {
            lg: imageUrl(r.imageKey, "lg"),
            md: imageUrl(r.imageKey, "md"),
            sm: imageUrl(r.imageKey, "sm"),
            width: r.width,
            height: r.height,
          },
      title: locked ? "" : r.title,
      caption: locked ? "" : r.caption,
      tags: locked ? [] : (tagsByPost.get(r.id) ?? []).sort(),
      meta: locked ? null : r.meta,
      theme: theme
        ? {
            id: theme.id,
            title: theme.title,
            template: theme.template,
            templateName: theme.templateName,
            accent: theme.accent,
            dayKey: theme.dayKey,
          }
        : null,
      eventId: r.eventId,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
      editedByAdmin: !!r.editedByAdminAt,
      status: r.status,
      counts: {
        likes: r.likeCount,
        comments: r.commentCount,
        bookmarks: r.bookmarkCount,
        views: r.viewCount,
      },
      viewer: {
        liked: liked.has(r.id),
        bookmarked: bookmarked.has(r.id),
        isMine,
        canEdit: isMine || viewer.role === "admin",
      },
    };
  });
}

/** いいね・ブックマーク済みの投稿ID（いいね・ブックマーク機能で実装） */
async function loadViewerSet(): Promise<Set<string>> {
  return new Set();
}

// ------------------------------------------------------------ ハッシュタグ
async function attachTags(tx: Pick<typeof db, "insert" | "select" | "update" | "delete" | "execute">, postId: string, tags: string[]) {
  if (tags.length === 0) return;
  await tx
    .insert(hashtags)
    .values(tags.map((name) => ({ name })))
    .onConflictDoNothing({ target: hashtags.name });
  const rows = await tx.select({ id: hashtags.id }).from(hashtags).where(inArray(hashtags.name, tags));
  await tx
    .insert(postHashtags)
    .values(rows.map((r) => ({ postId, hashtagId: r.id })))
    .onConflictDoNothing();
  await tx
    .update(hashtags)
    .set({ postCount: sql`${hashtags.postCount} + 1` })
    .where(inArray(hashtags.id, rows.map((r) => r.id)));
}

async function detachTags(tx: Pick<typeof db, "select" | "update" | "delete">, postId: string) {
  const rows = await tx
    .select({ hashtagId: postHashtags.hashtagId })
    .from(postHashtags)
    .where(eq(postHashtags.postId, postId));
  if (rows.length === 0) return;
  await tx.delete(postHashtags).where(eq(postHashtags.postId, postId));
  await tx
    .update(hashtags)
    .set({ postCount: sql`greatest(${hashtags.postCount} - 1, 0)` })
    .where(inArray(hashtags.id, rows.map((r) => r.hashtagId)));
}

// ------------------------------------------------------------ 作成・編集・削除
export type CreatePostInput = {
  title: string;
  caption: string;
  tags: string[] | string;
  themeId?: string | null;
  meta: PhotoMeta;
};

async function storeImages(key: string, img: ProcessedPostImage) {
  await Promise.all([
    putObject(`${key}/lg.webp`, img.lg, "image/webp"),
    putObject(`${key}/md.webp`, img.md, "image/webp"),
    putObject(`${key}/sm.webp`, img.sm, "image/webp"),
  ]);
}

export async function deletePostImages(imageKey: string) {
  await deleteObjects(VARIANTS.map((v) => `${imageKey}/${v}.webp`));
}

/** 今日のお題への投稿を作成する */
export async function createThemePost(
  viewer: ViewerCtx,
  input: CreatePostInput,
  image: Buffer,
  at: Date,
): Promise<{ post: PostDTO; row: PostRow }> {
  const theme = await getCurrentTheme(at);
  if (input.themeId && input.themeId !== theme.id) {
    throw conflict("お題が切り替わりました。新しいお題を確認してから投稿してください", "theme_changed");
  }
  const limit = await getSetting<number | null>(SETTING_KEYS.dailyPostLimit, null);
  if (limit !== null && limit > 0) {
    const mine = await countPostsForTheme(theme.id, viewer.id);
    if (mine >= limit) throw tooMany(60, `このお題への投稿は1日${limit}件までです`);
  }
  const processed = await processPostImage(image);
  const row = await insertPost(viewer, { ...input, kind: "theme", themeId: theme.id, eventId: null }, processed, at);
  const [post] = await hydratePosts([row], viewer, at);
  return { post, row };
}

/** 投稿を保存する（画像の保存・ハッシュタグの登録を含む）。イベント投稿からも使う */
export async function insertPost(
  viewer: ViewerCtx,
  input: CreatePostInput & { kind: "theme" | "event"; themeId: string | null; eventId: string | null },
  processed: ProcessedPostImage,
  at: Date,
): Promise<PostRow> {
  const id = randomUUID();
  const imageKey = `posts/${id}-${randomId(12)}`;
  await storeImages(imageKey, processed);
  const tags = collectTags(input.tags, input.caption);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(posts)
        .values({
          id,
          userId: viewer.id,
          kind: input.kind,
          themeId: input.themeId,
          eventId: input.eventId,
          title: input.title,
          caption: input.caption,
          imageKey,
          width: processed.width,
          height: processed.height,
          placeholder: processed.placeholder,
          colors: processed.colors,
          meta: input.meta,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      await attachTags(tx, id, tags);
      return row;
    });
  } catch (e) {
    await deletePostImages(imageKey);
    throw e;
  }
}

async function loadPostRow(id: string): Promise<PostRow> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("投稿が見つかりませんでした");
  const row = await db.query.posts.findFirst({ where: eq(posts.id, id) });
  if (!row || row.status === "deleted") throw notFound("投稿が見つかりませんでした");
  return row;
}

/** 投稿を1件取得（非表示の投稿は本人と管理者だけが見られる） */
export async function getPost(viewer: ViewerCtx, id: string, at: Date): Promise<PostDTO> {
  const row = await loadPostRow(id);
  const author = await db.query.users.findFirst({ where: eq(users.id, row.userId), columns: { status: true } });
  const isOwnerOrAdmin = row.userId === viewer.id || viewer.role === "admin";
  if (author?.status !== "active" && viewer.role !== "admin") throw notFound("投稿が見つかりませんでした");
  if (row.status === "hidden" && !isOwnerOrAdmin) throw notFound("投稿が見つかりませんでした");
  const [dto] = await hydratePosts([row], viewer, at);
  return dto;
}

export async function updatePost(
  viewer: ViewerCtx,
  id: string,
  patch: { title?: string; caption?: string; tags?: string[] | string },
  at: Date,
  opts: { asAdmin?: boolean } = {},
): Promise<PostDTO> {
  const row = await loadPostRow(id);
  const isOwner = row.userId === viewer.id;
  if (!isOwner && !(opts.asAdmin && viewer.role === "admin")) throw forbidden("この投稿は編集できません");
  const values: Partial<PostRow> = { updatedAt: at };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.caption !== undefined) values.caption = patch.caption;
  if (isOwner && !opts.asAdmin) values.editedAt = at;
  else values.editedByAdminAt = at;
  const updated = await db.transaction(async (tx) => {
    const [u] = await tx.update(posts).set(values).where(eq(posts.id, id)).returning();
    if (patch.tags !== undefined || patch.caption !== undefined) {
      const current = patch.tags ?? (await currentTagNames(id));
      await detachTags(tx, id);
      await attachTags(tx, id, collectTags(current, patch.caption ?? u.caption));
    }
    return u;
  });
  const [dto] = await hydratePosts([updated], viewer, at);
  return dto;
}

async function currentTagNames(postId: string): Promise<string[]> {
  const rows = await db
    .select({ name: hashtags.name })
    .from(postHashtags)
    .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
    .where(eq(postHashtags.postId, postId));
  return rows.map((r) => r.name);
}

/** 投稿を削除する（本人または管理者）。画像ファイルも消す */
export async function deletePost(viewer: ViewerCtx, id: string, opts: { asAdmin?: boolean } = {}): Promise<PostRow> {
  const row = await loadPostRow(id);
  if (row.userId !== viewer.id && !(opts.asAdmin && viewer.role === "admin")) {
    throw forbidden("この投稿は削除できません");
  }
  const [deleted] = await db.transaction(async (tx) => {
    await detachTags(tx, id);
    return tx.update(posts).set({ status: "deleted", updatedAt: new Date() }).where(eq(posts.id, id)).returning();
  });
  await deletePostImages(row.imageKey);
  return deleted;
}

// ------------------------------------------------------------ 一覧
const PAGE = 24;

async function pageOf(viewer: ViewerCtx, at: Date, where: SQL | undefined, cursor: string | null): Promise<PostPage> {
  const c = decodeCursor(cursor);
  const rows = await db
    .select({ post: posts })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .where(and(where, eq(posts.status, "visible"), eq(users.status, "active"), beforeCursor(c)))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(PAGE + 1);
  const list = rows.slice(0, PAGE).map((r) => r.post);
  const items = await hydratePosts(list, viewer, at);
  const last = list[list.length - 1];
  return { items, nextCursor: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null };
}

export function listUserPosts(viewer: ViewerCtx, userId: string, at: Date, cursor: string | null) {
  return pageOf(viewer, at, eq(posts.userId, userId), cursor);
}

export function listThemePosts(viewer: ViewerCtx, themeId: string, at: Date, cursor: string | null) {
  return pageOf(viewer, at, eq(posts.themeId, themeId), cursor);
}

export function listEventPosts(viewer: ViewerCtx, eventId: string, at: Date, cursor: string | null) {
  return pageOf(viewer, at, eq(posts.eventId, eventId), cursor);
}

export function assertTitle(title: string) {
  if (!title.trim()) throw badRequest("タイトルを入力してください", { fields: { title: "タイトルを入力してください" } });
}
