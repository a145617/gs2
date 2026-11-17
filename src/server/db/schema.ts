import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
