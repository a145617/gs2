import { z } from "zod";
import { TEMPLATE_KEYS } from "./templates";

// クライアントとサーバーで共有する入力チェック

/** 制御文字を取り除き、前後の空白を詰める */
export const cleanText = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

export const LIMITS = {
  displayName: 30,
  bio: 160,
  passwordMin: 8,
  passwordMax: 128,
} as const;

export const emailSchema = z
  .string("メールアドレスを入力してください")
  .trim()
  .toLowerCase()
  .min(1, "メールアドレスを入力してください")
  .max(254, "メールアドレスが長すぎます")
  .pipe(z.email("メールアドレスの形式が正しくありません"));

export const passwordSchema = z
  .string("パスワードを入力してください")
  .min(LIMITS.passwordMin, `パスワードは${LIMITS.passwordMin}文字以上にしてください`)
  .max(LIMITS.passwordMax, `パスワードは${LIMITS.passwordMax}文字以内にしてください`);

export const displayNameSchema = z
  .string("ユーザー名を入力してください")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "ユーザー名を入力してください")
      .max(LIMITS.displayName, `ユーザー名は${LIMITS.displayName}文字以内にしてください`),
  );

export const bioSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().max(LIMITS.bio, `自己紹介は${LIMITS.bio}文字以内にしてください`));

export const signupSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string("パスワードを入力してください").min(1, "パスワードを入力してください").max(LIMITS.passwordMax),
});

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: bioSchema.optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
  newPassword: passwordSchema,
});

export const accountDeleteSchema = z.object({
  password: z.string().min(1, "パスワードを入力してください"),
});

// ------------------------------------------------------------------ 投稿
export const POST_LIMITS = { title: 40, caption: 500, tagsInput: 400 } as const;

export const postTitleSchema = z
  .string("タイトルを入力してください")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "タイトルを入力してください")
      .max(POST_LIMITS.title, `タイトルは${POST_LIMITS.title}文字以内にしてください`),
  );

export const postCaptionSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
  .pipe(z.string().max(POST_LIMITS.caption, `キャプションは${POST_LIMITS.caption}文字以内にしてください`));

export const postTagsSchema = z.union([
  z.string().max(POST_LIMITS.tagsInput, "ハッシュタグが長すぎます"),
  z.array(z.string().max(60)).max(20),
]);

export const postUpdateSchema = z.object({
  title: postTitleSchema.optional(),
  caption: postCaptionSchema.optional(),
  tags: postTagsSchema.optional(),
});

// ------------------------------------------------------------------ お題（管理者）
export const THEME_LIMITS = { title: 20, description: 200 } as const;

export const themeTitleSchema = z
  .string("お題を入力してください")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "お題を入力してください")
      .max(THEME_LIMITS.title, `お題は${THEME_LIMITS.title}文字以内にしてください`),
  );

export const themeDescriptionSchema = z
  .string()
  .transform(cleanText)
  .pipe(z.string().max(THEME_LIMITS.description, `説明は${THEME_LIMITS.description}文字以内にしてください`));

export const templateKeySchema = z.enum(TEMPLATE_KEYS, "表示テンプレートを選んでください");

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB の形式で指定してください");

export const themeInputSchema = z.object({
  title: themeTitleSchema,
  description: themeDescriptionSchema.default(""),
  template: templateKeySchema,
  accent: hexColorSchema.optional(),
});

/** 日時（ISO 8601、タイムゾーン付き） */
export const isoDateSchema = z.iso
  .datetime({ offset: true, message: "日時の形式が正しくありません" })
  .transform((s) => new Date(s));
