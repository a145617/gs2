import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  real,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { TEMPLATE_KEYS } from "../../lib/templates";
import type { ColorFeatures } from "../../lib/color";
import type { PhotoMeta } from "../../lib/photo-meta";
import type { PaletteColor } from "../../lib/pixel-art";

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
    eventId: uuid("event_id").references((): AnyPgColumn => events.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    caption: text("caption").notNull().default(""),
    /** 画像の保存キーの接頭辞（推測できない文字列を含む）。<key>/lg.webp などで保存 */
    imageKey: text("image_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** ぼかし表示用の小さなプレビュー（data URL） */
    placeholder: text("placeholder").notNull(),
    /** イベントのピクセルアートに使う正方形の小さな画像（data URL、イベント投稿のみ） */
    tile: text("tile"),
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
    /** 検索用のテキスト（タイトル・キャプション・タグを正規化して連結） */
    searchText: text("search_text").notNull().default(""),
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

// ---------------------------------------------------------------------------
// ミュート・通報
// ---------------------------------------------------------------------------
/** 特定のユーザーの投稿を表示しない */
export const mutes = pgTable(
  "mutes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mutedUserId: uuid("muted_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mutedUserId] })],
);

export const reportTarget = pgEnum("report_target", ["post", "comment", "user"]);
export const reportReason = pgEnum("report_reason", [
  "spam",
  "inappropriate",
  "violence",
  "harassment",
  "copyright",
  "privacy",
  "off_topic",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** 通報された内容の持ち主（投稿者・コメント主・ユーザー本人） */
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: reportReason("reason").notNull(),
    detail: text("detail").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_unique_idx").on(t.reporterId, t.targetType, t.targetId),
    index("reports_status_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
  ],
);

export type ReportRow = typeof reports.$inferSelect;

// ---------------------------------------------------------------------------
// 閲覧（閲覧数とおすすめの計算に使う）
// ---------------------------------------------------------------------------
export const postViews = pgTable(
  "post_views",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
    /** 同じ人が見た回数 */
    count: integer("count").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("post_views_post_idx").on(t.postId)],
);

// ---------------------------------------------------------------------------
// イベント（色を指定された写真を1ピクセルとして集め、みんなで1枚の絵を完成させる）
// ---------------------------------------------------------------------------
export const eventSource = pgEnum("event_source", ["auto", "admin", "debug"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    gridW: integer("grid_w").notNull(),
    gridH: integer("grid_h").notNull(),
    /** 使う色（番号はマスの色番号に対応） */
    palette: jsonb("palette").$type<PaletteColor[]>().notNull(),
    /** 完成させる絵（各マスの色番号、横 gridW × 縦 gridH） */
    cells: jsonb("cells").$type<number[]>().notNull(),
    /** 指定の色が画面のこの割合以上なら合格（0〜1） */
    threshold: real("threshold").notNull().default(0.25),
    /** 指定の色に「近い」とみなす色差（CIEDE2000） */
    deltaE: real("delta_e").notNull().default(22),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** 開始のお知らせを送った時刻（予約したイベントは開始後の最初のアクセスで送る） */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    source: eventSource("source").notNull(),
    presetKey: text("preset_key"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("events_starts_idx").on(t.startsAt)],
);

/** 参加者と、割り当てられた色 */
export const eventParticipants = pgTable(
  "event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    colorIndex: integer("color_index").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

/** ピクセルアートの各マス（写真で埋まると postId が入る） */
export const eventCells = pgTable(
  "event_cells",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    cellIndex: integer("cell_index").notNull(),
    colorIndex: integer("color_index").notNull(),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** 写真に指定の色が占めていた割合 */
    coverage: real("coverage"),
    filledAt: timestamp("filled_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.cellIndex] }), index("event_cells_color_idx").on(t.eventId, t.colorIndex)],
);

export type EventRow = typeof events.$inferSelect;
export type EventCellRow = typeof eventCells.$inferSelect;

// ---------------------------------------------------------------------------
// 管理（警告・操作の記録）
// ---------------------------------------------------------------------------
/** 管理者からアカウントへの警告。本人が確認するまで画面に表示する */
export const warnings = pgTable(
  "warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("warnings_user_idx").on(t.userId, t.createdAt)],
);

/** 管理者の操作の記録 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export type WarningRow = typeof warnings.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
