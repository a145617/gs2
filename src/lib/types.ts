// クライアントとサーバーで共有するデータの型（APIのレスポンス）

export type Role = "user" | "admin";

/** 他のユーザーにも見える公開プロフィール */
export type PublicUser = {
  id: string;
  /** 自動で割り振られたユーザーID（@の後ろ） */
  handle: string;
  /** ユーザー名（表示名） */
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: Role;
  createdAt: string;
};

/** ログイン中の本人の情報 */
export type Me = PublicUser & {
  email: string;
  isTestUser: boolean;
};

export type MeResponse = {
  user: Me;
  /** デバッグモードが有効か */
  debugMode: boolean;
  /** サーバーの現在時刻（デバッグの仮想時計を反映） */
  serverNow: string;
  /** デバッグのユーザー切り替え中なら、切り替え元のユーザー */
  impersonator: { id: string; handle: string; displayName: string } | null;
};

export type ProfileResponse = {
  user: PublicUser;
  isMe: boolean;
};

/** お題 */
export type ThemeDTO = {
  id: string;
  title: string;
  description: string;
  template: import("./templates").TemplateKey;
  /** 表示テンプレートの名前（窓・額縁 など） */
  templateName: string;
  /** お題の色（UIのアクセント色にも使う） */
  accent: string;
  startsAt: string;
  endsAt: string;
  /** お題の日（YYYY-MM-DD、朝5時切り替え） */
  dayKey: string;
  source: "auto" | "admin" | "debug";
  isCurrent: boolean;
};

export type CurrentThemeResponse = {
  theme: ThemeDTO;
  /** 次にお題が切り替わる時刻 */
  nextChangeAt: string;
  serverNow: string;
};
