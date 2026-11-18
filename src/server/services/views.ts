import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { postViews, posts } from "../db/schema";
import { getGateInfo, isLocked, type ViewerCtx } from "./posts";

/**
 * 閲覧を記録する。閲覧数は「見た人の数」（同じ人が何度見ても1回）。自分の投稿は数えない。
 * 今日のお題に投稿する前で中身が見えていない投稿も数えない。
 */
export async function recordViews(viewer: ViewerCtx, postIds: string[], at: Date): Promise<number> {
  const ids = Array.from(new Set(postIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)))).slice(0, 50);
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: posts.id, userId: posts.userId, kind: posts.kind, themeId: posts.themeId })
    .from(posts)
    .where(and(inArray(posts.id, ids), eq(posts.status, "visible"), ne(posts.userId, viewer.id)));
  const gate = await getGateInfo(viewer, at);
  const visible = rows.filter((r) => !isLocked(r, viewer, gate)).map((r) => r.id);
  if (visible.length === 0) return 0;
  const inserted = await db
    .insert(postViews)
    .values(visible.map((postId) => ({ userId: viewer.id, postId, firstViewedAt: at, lastViewedAt: at })))
    .onConflictDoUpdate({
      target: [postViews.userId, postViews.postId],
      set: { lastViewedAt: at, count: sql`${postViews.count} + 1` },
    })
    .returning({ postId: postViews.postId, count: postViews.count });
  const firstTime = inserted.filter((r) => r.count === 1).map((r) => r.postId);
  if (firstTime.length > 0) {
    await db
      .update(posts)
      .set({ viewCount: sql`${posts.viewCount} + 1` })
      .where(inArray(posts.id, firstTime));
  }
  return firstTime.length;
}
