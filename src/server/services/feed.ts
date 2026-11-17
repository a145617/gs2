import { and, desc, eq, gte, inArray, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { bookmarks, comments, follows, hashtags, likes, mutes, postHashtags, postViews, posts, themes, users } from "../db/schema";
import { getCurrentTheme } from "./themes";
import { getGateInfo, hydratePosts, isLocked, type ViewerCtx } from "./posts";
import { colorSimilarity, type ColorFeatures } from "@/lib/color";
import type { FeedItemDebug, FeedPage } from "@/lib/types";

// =============================================================================
// フィード（ホームのスクロール表示）
// 仕様: 上部にフォローユーザーの投稿を優先的に表示し、それ以降はその時点で閲覧数・いいねの多いもの、
//       ユーザーの嗜好にあった投稿をランダムに表示する。
// =============================================================================

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** フォロー中の人の投稿として上部に出す期間 */
const FOLLOW_WINDOW = 3 * DAY;
/** おすすめの候補にする期間と件数 */
const CANDIDATE_WINDOW = 14 * DAY;
const MAX_CANDIDATES = 400;
const MAX_FOLLOWING = 60;
export const FEED_PAGE = 8;

// ------------------------------------------------------------------ 乱数
/** 文字列から 32bit の種を作る（FNV-1a） */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 種から 0〜1 の一様乱数（mulberry32） */
function random01(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ 好み
export type Preference = {
  tags: Map<string, number>;
  authors: Map<string, number>;
  templates: Map<string, number>;
  color: ColorFeatures | null;
  /** 好みの元になった操作の数 */
  signals: number;
};

function normalize(m: Map<string, number>) {
  const max = Math.max(0, ...m.values());
  if (max > 0) for (const [k, v] of m) m.set(k, v / max);
  return m;
}

/**
 * 閲覧者の好み: いいね・ブックマーク・コメント・閲覧した投稿から、
 * よく反応するハッシュタグ・作者・表示テンプレート・色合いを求める。
 */
export async function buildPreference(viewerId: string, at: Date): Promise<Preference> {
  const since = new Date(at.getTime() - 60 * DAY);
  const [liked, saved, commented, viewed] = await Promise.all([
    db.select({ postId: likes.postId }).from(likes).where(and(eq(likes.userId, viewerId), gte(likes.createdAt, since))).limit(300),
    db.select({ postId: bookmarks.postId }).from(bookmarks).where(and(eq(bookmarks.userId, viewerId), gte(bookmarks.createdAt, since))).limit(300),
    db.select({ postId: comments.postId }).from(comments).where(and(eq(comments.userId, viewerId), gte(comments.createdAt, since))).limit(300),
    db.select({ postId: postViews.postId }).from(postViews).where(and(eq(postViews.userId, viewerId), gte(postViews.lastViewedAt, since))).orderBy(desc(postViews.lastViewedAt)).limit(300),
  ]);
  const weight = new Map<string, number>();
  const add = (rows: { postId: string }[], w: number) => {
    for (const r of rows) weight.set(r.postId, (weight.get(r.postId) ?? 0) + w);
  };
  add(liked, 3);
  add(saved, 4);
  add(commented, 2);
  add(viewed, 0.5);

  const pref: Preference = { tags: new Map(), authors: new Map(), templates: new Map(), color: null, signals: weight.size };
  if (weight.size === 0) return pref;

  const ids = [...weight.keys()];
  const [postRows, tagRows] = await Promise.all([
    db
      .select({ id: posts.id, userId: posts.userId, colors: posts.colors, template: themes.template })
      .from(posts)
      .leftJoin(themes, eq(themes.id, posts.themeId))
      .where(inArray(posts.id, ids)),
    db
      .select({ postId: postHashtags.postId, name: hashtags.name })
      .from(postHashtags)
      .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
      .where(inArray(postHashtags.postId, ids)),
  ]);

  const hue = new Array(12).fill(0);
  let light = 0;
  let chroma = 0;
  let total = 0;
  for (const p of postRows) {
    const w = weight.get(p.id) ?? 0;
    if (p.userId !== viewerId) pref.authors.set(p.userId, (pref.authors.get(p.userId) ?? 0) + w);
    if (p.template) pref.templates.set(p.template, (pref.templates.get(p.template) ?? 0) + w);
    if (p.colors) {
      for (let i = 0; i < 12; i++) hue[i] += (p.colors.hue[i] ?? 0) * w;
      light += p.colors.lightness * w;
      chroma += p.colors.chroma * w;
      total += w;
    }
  }
  for (const t of tagRows) pref.tags.set(t.name, (pref.tags.get(t.name) ?? 0) + (weight.get(t.postId) ?? 0));
  normalize(pref.tags);
  normalize(pref.authors);
  normalize(pref.templates);
  if (total > 0) {
    const sum = hue.reduce((a, b) => a + b, 0) || 1;
    pref.color = { dominant: [], hue: hue.map((v) => v / sum), lightness: light / total, chroma: chroma / total };
  }
  return pref;
}

// ------------------------------------------------------------------ 並び順
type Candidate = {
  id: string;
  userId: string;
  themeId: string | null;
  template: string | null;
  colors: ColorFeatures;
  likeCount: number;
  commentCount: number;
  bookmarkCount: number;
  viewCount: number;
  createdAt: Date;
  seen: boolean;
  tags: string[];
};

export type FeedOrder = {
  ids: string[];
  section: Map<string, "following" | "discover">;
  debug: Map<string, FeedItemDebug>;
};

/** 「その時点で」閲覧数・いいねが多いか（古い投稿ほど弱くなる） */
export function popularity(c: Pick<Candidate, "likeCount" | "commentCount" | "bookmarkCount" | "viewCount" | "createdAt">, at: Date) {
  const engagement = c.likeCount * 3 + c.commentCount * 2 + c.bookmarkCount * 2 + c.viewCount;
  const ageHours = Math.max(0, (at.getTime() - c.createdAt.getTime()) / HOUR);
  return Math.log1p(engagement) / Math.pow(1 + ageHours / 36, 0.6);
}

export function preferenceScore(c: Pick<Candidate, "tags" | "userId" | "template" | "colors">, pref: Preference) {
  if (pref.signals === 0) return { tag: 0, author: 0, template: 0, color: 0, total: 0.35 };
  const tag = c.tags.length ? Math.max(...c.tags.map((t) => pref.tags.get(t) ?? 0)) : 0;
  const author = pref.authors.get(c.userId) ?? 0;
  const template = c.template ? (pref.templates.get(c.template) ?? 0) : 0;
  const color = pref.color ? colorSimilarity(c.colors, pref.color) : 0.5;
  return { tag, author, template, color, total: 0.35 * tag + 0.25 * author + 0.1 * template + 0.3 * color };
}

/**
 * フィードの並び順を決める（seed が同じなら同じ順番になるので、ページ送りしても重複しない）。
 */
export async function buildFeedOrder(viewer: ViewerCtx, at: Date, seed: string): Promise<FeedOrder> {
  const currentTheme = await getCurrentTheme(at);
  const mutedSub = db.select({ id: mutes.mutedUserId }).from(mutes).where(eq(mutes.userId, viewer.id));
  const followingSub = db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, viewer.id));
  const seenExpr = sql<boolean>`exists (select 1 from post_views pv where pv.user_id = ${viewer.id} and pv.post_id = ${posts.id})`;

  const base = and(
    eq(posts.status, "visible"),
    eq(users.status, "active"),
    lte(posts.createdAt, at),
    notInArray(posts.userId, mutedSub),
  );

  const select = {
    id: posts.id,
    userId: posts.userId,
    themeId: posts.themeId,
    template: themes.template,
    colors: posts.colors,
    likeCount: posts.likeCount,
    commentCount: posts.commentCount,
    bookmarkCount: posts.bookmarkCount,
    viewCount: posts.viewCount,
    createdAt: posts.createdAt,
    seen: seenExpr,
  };

  // 1) フォロー中の人の投稿（まだ見ていないものを先に、新しい順）
  const followRows = await db
    .select(select)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(themes, eq(themes.id, posts.themeId))
    .where(and(base, inArray(posts.userId, followingSub), gte(posts.createdAt, new Date(at.getTime() - FOLLOW_WINDOW))))
    .orderBy(desc(posts.createdAt))
    .limit(MAX_FOLLOWING);
  followRows.sort((a, b) => Number(a.seen) - Number(b.seen) || b.createdAt.getTime() - a.createdAt.getTime());

  // 2) それ以外（自分以外・フォロー外）の候補
  const followIds = followRows.map((r) => r.id);
  const candRows = await db
    .select(select)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(themes, eq(themes.id, posts.themeId))
    .where(
      and(
        base,
        ne(posts.userId, viewer.id),
        notInArray(posts.userId, followingSub),
        gte(posts.createdAt, new Date(at.getTime() - CANDIDATE_WINDOW)),
      ),
    )
    .orderBy(desc(posts.createdAt))
    .limit(MAX_CANDIDATES);

  const candIds = candRows.map((r) => r.id);
  const [tagRows, pref] = await Promise.all([
    candIds.length
      ? db
          .select({ postId: postHashtags.postId, name: hashtags.name })
          .from(postHashtags)
          .innerJoin(hashtags, eq(hashtags.id, postHashtags.hashtagId))
          .where(inArray(postHashtags.postId, candIds))
      : Promise.resolve([]),
    buildPreference(viewer.id, at),
  ]);
  const tagsByPost = new Map<string, string[]>();
  for (const t of tagRows) tagsByPost.set(t.postId, [...(tagsByPost.get(t.postId) ?? []), t.name]);

  const cands: Candidate[] = candRows.map((r) => ({ ...r, seen: Boolean(r.seen), tags: tagsByPost.get(r.id) ?? [] }));
  const pops = cands.map((c) => popularity(c, at));
  const maxPop = Math.max(0.0001, ...pops);
  const debug = new Map<string, FeedItemDebug>();
  const keyed = cands.map((c, i) => {
    const popN = pops[i] / maxPop;
    const pref_ = preferenceScore(c, pref);
    const themeBonus = c.themeId === currentTheme.id ? 0.15 : 0;
    const seenFactor = c.seen ? 0.35 : 1;
    const weight = Math.max(0.01, (0.15 + 0.45 * popN + 0.4 * pref_.total + themeBonus) * seenFactor);
    // 重み付きランダム（重いほど上に来やすいが、毎回少しずつ違う並びになる）
    const u = Math.max(1e-9, random01(hash32(`${seed}:${c.id}`)));
    const key = -Math.log(u) / weight;
    debug.set(c.id, {
      section: "discover",
      popularity: Number(popN.toFixed(3)),
      preference: {
        tag: Number(pref_.tag.toFixed(3)),
        author: Number(pref_.author.toFixed(3)),
        template: Number(pref_.template.toFixed(3)),
        color: Number(pref_.color.toFixed(3)),
        total: Number(pref_.total.toFixed(3)),
      },
      themeBonus,
      seen: c.seen,
      weight: Number(weight.toFixed(3)),
      randomKey: Number(key.toFixed(3)),
    });
    return { id: c.id, key };
  });
  keyed.sort((a, b) => a.key - b.key);

  const section = new Map<string, "following" | "discover">();
  for (const r of followRows) {
    section.set(r.id, "following");
    debug.set(r.id, {
      section: "following",
      popularity: 0,
      preference: { tag: 0, author: 0, template: 0, color: 0, total: 0 },
      themeBonus: 0,
      seen: Boolean(r.seen),
      weight: 0,
      randomKey: 0,
    });
  }
  for (const k of keyed) section.set(k.id, "discover");
  return { ids: [...followIds, ...keyed.map((k) => k.id)], section, debug };
}

/** フィードの1ページ分 */
export async function getFeedPage(
  viewer: ViewerCtx,
  at: Date,
  opts: { seed: string; offset: number; limit?: number; withDebug?: boolean },
): Promise<FeedPage> {
  const limit = Math.min(opts.limit ?? FEED_PAGE, 30);
  const order = await buildFeedOrder(viewer, at, opts.seed);
  const pageIds = order.ids.slice(opts.offset, opts.offset + limit);
  const rows = pageIds.length ? await db.select().from(posts).where(inArray(posts.id, pageIds)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  const gate = await getGateInfo(viewer, at);
  const items = await hydratePosts(ordered, viewer, at, gate);
  const next = opts.offset + limit;
  return {
    items: items.map((p) => ({
      ...p,
      feedSection: order.section.get(p.id) ?? "discover",
      feedDebug: opts.withDebug ? order.debug.get(p.id) : undefined,
    })),
    nextCursor: next < order.ids.length ? String(next) : null,
    total: order.ids.length,
    lockedCount: ordered.filter((r) => isLocked(r, viewer, gate)).length,
  };
}
