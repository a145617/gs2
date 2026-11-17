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
  /** 未読のお知らせの数 */
  unreadNotifications: number;
};

export type ProfileResponse = {
  user: PublicUser;
  isMe: boolean;
  counts: { posts: number; followers: number; following: number };
  /** 閲覧者がこのユーザーをフォローしているか */
  following: boolean;
  /** このユーザーが閲覧者をフォローしているか */
  followsMe: boolean;
  /** 閲覧者がこのユーザーをミュートしているか */
  muted: boolean;
};

/** ユーザーの一覧（フォロワーなど） */
export type UserListItem = Pick<PublicUser, "id" | "handle" | "displayName" | "avatarUrl" | "bio"> & {
  following: boolean;
};

export type UserListPage = { items: UserListItem[]; nextCursor: string | null };

/** コメント */
export type CommentDTO = {
  id: string;
  postId: string;
  author: PostAuthor;
  body: string;
  createdAt: string;
  editedAt: string | null;
  editedByAdmin: boolean;
  status: "visible" | "hidden" | "deleted";
  viewer: { isMine: boolean; canEdit: boolean; canDelete: boolean };
};

export type CommentPage = { items: CommentDTO[]; nextCursor: string | null; total: number };

export type NotificationDTO = {
  id: string;
  type:
    | "like"
    | "comment"
    | "follow"
    | "warning"
    | "post_edited"
    | "post_removed"
    | "comment_edited"
    | "comment_removed"
    | "event"
    | "report_resolved";
  actor: PostAuthor | null;
  postId: string | null;
  /** 投稿の小さな画像（あれば） */
  postThumb: string | null;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

export type NotificationPage = { items: NotificationDTO[]; nextCursor: string | null };

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
  /** 自分がこのお題に投稿した数 */
  myPostCount: number;
  /** 1日の投稿数の上限（null なら無制限） */
  dailyLimit: number | null;
  /** このお題への投稿の総数 */
  postCount: number;
};

/** 投稿の作者（一覧表示用） */
export type PostAuthor = Pick<PublicUser, "id" | "handle" | "displayName" | "avatarUrl">;

export type PostImage = {
  lg: string;
  md: string;
  sm: string;
  width: number;
  height: number;
};

/** 投稿 */
export type PostDTO = {
  id: string;
  kind: "theme" | "event";
  author: PostAuthor;
  /**
   * 今日のお題の投稿で、閲覧者がまだ投稿していない場合は true。
   * このとき画像・タイトル・本文は返さず、ぼかしたプレビューだけを返す。
   */
  locked: boolean;
  placeholder: string;
  image: PostImage | null;
  title: string;
  caption: string;
  tags: string[];
  meta: import("./photo-meta").PhotoMeta | null;
  theme: Pick<ThemeDTO, "id" | "title" | "template" | "templateName" | "accent" | "dayKey"> | null;
  eventId: string | null;
  /** イベントの投稿なら、イベント名と担当した色 */
  event: { id: string; title: string; colorHex: string; colorName: string } | null;
  createdAt: string;
  editedAt: string | null;
  editedByAdmin: boolean;
  status: "visible" | "hidden" | "deleted";
  counts: { likes: number; comments: number; bookmarks: number; views: number };
  viewer: { liked: boolean; bookmarked: boolean; isMine: boolean; canEdit: boolean };
};

export type PostPage = { items: PostDTO[]; nextCursor: string | null };

/** フィードの並び順の内訳（デバッグ表示用） */
export type FeedItemDebug = {
  section: "following" | "discover";
  /** その時点での人気（閲覧数・いいね等、0〜1に正規化） */
  popularity: number;
  /** 好みとの近さ（ハッシュタグ・作者・表示テンプレート・色合い） */
  preference: { tag: number; author: number; template: number; color: number; total: number };
  /** 今日のお題の投稿への加点 */
  themeBonus: number;
  /** 閲覧済みか（閲覧済みは出にくくする） */
  seen: boolean;
  /** 最終的な重み（大きいほど上に来やすい） */
  weight: number;
  /** 重み付きランダムで使った値（小さいほど上） */
  randomKey: number;
};

export type FeedPost = PostDTO & { feedSection: "following" | "discover"; feedDebug?: FeedItemDebug };

// ------------------------------------------------------------------ イベント
export type EventColor = {
  index: number;
  hex: string;
  name: string;
  /** この色のマスの数と、埋まった数 */
  total: number;
  filled: number;
};

export type EventDTO = {
  id: string;
  title: string;
  description: string;
  gridW: number;
  gridH: number;
  palette: EventColor[];
  threshold: number;
  /** 指定の色に「近い」とみなす色差 */
  deltaE: number;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  status: "upcoming" | "active" | "completed" | "ended";
  totalCells: number;
  filledCells: number;
  participants: number;
  source: "auto" | "admin" | "debug";
};

/** 閲覧者に割り当てられた色 */
export type MyEventColor = { index: number; hex: string; name: string; myPosts: number } | null;

export type EventCellDTO = {
  /** マスの番号（左上から右へ、次の行へ） */
  i: number;
  /** 色の番号 */
  c: number;
  /** 埋めた投稿（埋まっていなければ null） */
  postId: string | null;
  /** 埋めた写真の小さな画像（data URL） */
  tile: string | null;
};

export type EventDetailResponse = {
  event: EventDTO;
  cells: EventCellDTO[];
  myColor: MyEventColor;
  serverNow: string;
};

/** イベントへの投稿の結果 */
export type EventPostResult = { post: PostDTO; cellIndex: number; coverage: number; completed: boolean };

export type CurrentEventResponse = {
  event: EventDTO | null;
  myColor: MyEventColor;
  /** 次に予定されているイベント（あれば） */
  upcoming: EventDTO | null;
  serverNow: string;
};

export type FeedPage = {
  items: FeedPost[];
  nextCursor: string | null;
  /** フィード全体の件数 */
  total: number;
  /** このページのうち、今日のお題に投稿するまで見られない投稿の数 */
  lockedCount: number;
};
