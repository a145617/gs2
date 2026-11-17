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
