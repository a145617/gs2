import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { TEMPLATE_KEYS } from "../../lib/templates";
import type { ColorFeatures } from "../../lib/color";
import type { PhotoMeta } from "../../lib/photo-meta";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// アプリ設定（キー・バリュー）。デバッグ用の仮想時計や各種上限などを保存する
// ---------------------------------------------------------------------------
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// アカウント
// ---------------------------------------------------------------------------
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "deleted"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** アカウント作成時に自動で割り振るユーザーID（変更不可） */
    handle: text("handle").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /** ユーザー名（本人が変更できる表示名） */
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    /** アイコン画像の保存キー（未設定なら null） */
    avatarKey: text("avatar_key"),
    role: userRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    /** デバッグ用に生成したテストユーザー */
    isTestUser: boolean("is_test_user").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("users_created_idx").on(t.createdAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** セッショントークンの SHA-256（トークン自体は保存しない） */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** デバッグモードのユーザー切り替えで作られたセッションなら、切り替え元のユーザー */
    impersonatorId: uuid("impersonator_id"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** ログイン試行などの回数制限 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

// ---------------------------------------------------------------------------
// お題（毎朝5時に切り替わる）
// ---------------------------------------------------------------------------
export const themeTemplate = pgEnum("theme_template", TEMPLATE_KEYS);
export const themeSource = pgEnum("theme_source", ["auto", "admin", "debug"]);

/** 自動で選ばれるお題の候補 */
export const themePool = pgTable("theme_pool", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().unique(),
  description: text("description").notNull().default(""),
  template: themeTemplate("template").notNull(),
  accent: text("accent").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  timesUsed: integer("times_used").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 実際に出題されたお題（自動・管理者・デバッグ） */
export const themes = pgTable(
  "themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    template: themeTemplate("template").notNull(),
    accent: text("accent").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** 自動出題のお題のみ: お題の日（YYYY-MM-DD）。1日1つに限定する */
    dayKey: text("day_key").unique(),
    source: themeSource("source").notNull(),
    poolId: uuid("pool_id").references(() => themePool.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("themes_starts_idx").on(t.startsAt), index("themes_ends_idx").on(t.endsAt)],
);

export type ThemeRow = typeof themes.$inferSelect;
export type ThemePoolRow = typeof themePool.$inferSelect;

// ---------------------------------------------------------------------------
// 投稿
// ---------------------------------------------------------------------------
export const postKind = pgEnum("post_kind", ["theme", "event"]);
export const postStatus = pgEnum("post_status", ["visible", "hidden", "deleted"]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: postKind("kind").notNull().default("theme"),
    themeId: uuid("theme_id").references(() => themes.id, { onDelete: "set null" }),
    eventId: uuid("event_id"),
    title: text("title").notNull(),
    caption: text("caption").notNull().default(""),
    /** 画像の保存キーの接頭辞（推測できない文字列を含む）。<key>/lg.webp などで保存 */
    imageKey: text("image_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** ぼかし表示用の小さなプレビュー（data URL） */
    placeholder: text("placeholder").notNull(),
    /** 色の特徴量（おすすめ表示に使う） */
    colors: jsonb("colors").$type<ColorFeatures>().notNull(),
    /** 撮影情報（シャッタースピード・ISO・絞り など。位置情報は保存しない） */
    meta: jsonb("meta").$type<PhotoMeta>().notNull(),
    status: postStatus("status").notNull().default("visible"),
    hiddenReason: text("hidden_reason"),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    bookmarkCount: integer("bookmark_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    editedByAdminAt: timestamp("edited_by_admin_at", { withTimezone: true }),
  },
  (t) => [
    index("posts_theme_idx").on(t.themeId, t.createdAt),
    index("posts_user_idx").on(t.userId, t.createdAt),
    index("posts_created_idx").on(t.createdAt),
    index("posts_event_idx").on(t.eventId),
  ],
);

export const hashtags = pgTable("hashtags", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 正規化したタグ名（# なし・小文字） */
  name: text("name").notNull().unique(),
  postCount: integer("post_count").notNull().default(0),
  createdAt: createdAt(),
});

export const postHashtags = pgTable(
  "post_hashtags",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    hashtagId: uuid("hashtag_id")
      .notNull()
      .references(() => hashtags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.hashtagId] }), index("post_hashtags_tag_idx").on(t.hashtagId)],
);

export type PostRow = typeof posts.$inferSelect;
export type HashtagRow = typeof hashtags.$inferSelect;

// ---------------------------------------------------------------------------
// いいね・ブックマーク・コメント・フォロー・通知
// ---------------------------------------------------------------------------
export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("likes_post_idx").on(t.postId)],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("bookmarks_user_idx").on(t.userId, t.createdAt)],
);

export const commentStatus = pgEnum("comment_status", ["visible", "hidden", "deleted"]);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: commentStatus("status").notNull().default("visible"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    editedByAdminAt: timestamp("edited_by_admin_at", { withTimezone: true }),
  },
  (t) => [index("comments_post_idx").on(t.postId, t.createdAt), index("comments_user_idx").on(t.userId)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId)],
);

export const notificationType = pgEnum("notification_type", [
  "like",
  "comment",
  "follow",
  "warning",
  "post_edited",
  "post_removed",
  "comment_edited",
  "comment_removed",
  "event",
  "report_resolved",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 通知を受け取るユーザー */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export type CommentRow = typeof comments.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
