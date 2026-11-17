import { and, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { follows, hashtags, postHashtags, posts, users } from "../db/schema";
import { mediaUrl } from "../storage";
import { getGateInfo, listPostsWhere, type ViewerCtx } from "./posts";
import { escapeLike, normalizeForSearch, splitQuery } from "@/lib/search";
import { normalizeTag } from "@/lib/hashtags";
import type { PostPage, UserListItem } from "@/lib/types";

/**
 * 投稿を検索する（タイトル・キャプション・ハッシュタグ）。
 * 空白区切りの複数語はすべて含むものを探す。「#」で始まる語はハッシュタグとして探す。
 * 今日のお題に投稿していない人には、今日のお題へのほかの人の投稿は検索結果に出さない。
 */
export async function searchPosts(viewer: ViewerCtx, q: string, at: Date, cursor: string | null): Promise<PostPage> {
  const terms = splitQuery(q);
  if (terms.length === 0) return { items: [], nextCursor: null };
  const conds: SQL[] = [];
  for (const term of terms) {
    if (term.startsWith("#") && term.length > 1) {
      const tag = normalizeTag(term);
      const tagged = db
        .select({ id: postHashtags.postId })
        .from(postHashtags)
        .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
        .where(sql`${hashtags.name} LIKE ${`${escapeLike(tag)}%`} ESCAPE '\\'`);
      conds.push(inArray(posts.id, tagged));
    } else {
      conds.push(sql`${posts.searchText} LIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`);
    }
  }
  const gate = await getGateInfo(viewer, at);
  if (!gate.viewerPostedCurrent && viewer.role !== "admin") {
    conds.push(
      sql`not (${posts.kind} = 'theme' and ${posts.themeId} = ${gate.currentThemeId} and ${posts.userId} <> ${viewer.id})`,
    );
  }
  return listPostsWhere(viewer, at, and(...conds), cursor);
}

/** ユーザーを検索する（ユーザー名・ユーザーID） */
export async function searchUsers(viewer: ViewerCtx, q: string): Promise<UserListItem[]> {
  const term = normalizeForSearch(q).replace(/^@/, "");
  if (!term) return [];
  const like = `%${escapeLike(term)}%`;
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        or(ilike(users.displayName, like), sql`${users.handle} LIKE ${`${escapeLike(term)}%`} ESCAPE '\\'`),
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(30);
  const ids = rows.map((r) => r.id);
  const mine = ids.length
    ? await db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, viewer.id), inArray(follows.followeeId, ids)))
    : [];
  const set = new Set(mine.map((m) => m.id));
  return rows.map((u) => ({
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: mediaUrl(u.avatarKey),
    bio: u.bio,
    following: set.has(u.id),
  }));
}

/** ハッシュタグを検索する（前方一致、投稿の多い順） */
export async function searchTags(q: string) {
  const tag = normalizeTag(q);
  if (!tag) return [];
  return db
    .select({ name: hashtags.name, postCount: hashtags.postCount })
    .from(hashtags)
    .where(and(sql`${hashtags.name} LIKE ${`${escapeLike(tag)}%`} ESCAPE '\\'`, ne(hashtags.postCount, 0)))
    .orderBy(desc(hashtags.postCount))
    .limit(30);
}

/** 最近よく使われているハッシュタグ */
export async function trendingTags(at: Date, days = 7) {
  const since = new Date(at.getTime() - days * 86400_000);
  return db
    .select({ name: hashtags.name, postCount: sql<number>`count(*)::int` })
    .from(postHashtags)
    .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
    .innerJoin(posts, eq(posts.id, postHashtags.postId))
    .where(and(eq(posts.status, "visible"), gte(posts.createdAt, since)))
    .groupBy(hashtags.name)
    .orderBy(desc(sql`count(*)`))
    .limit(15);
}
