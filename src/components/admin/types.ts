// 管理画面で使うAPIの応答の型（サーバー側の関数の戻り値から作る）
import type {
  adminGetUser,
  adminListComments,
  adminListPosts,
  adminListReports,
  adminListUsers,
  adminStats,
  listAuditLogs,
  pendingWarnings,
} from "@/server/services/admin";
import type { EventDTO, ThemeDTO } from "@/lib/types";
import type { PixelArt } from "@/lib/pixel-art";

type Page<T> = { items: T[]; nextCursor: string | null };
type ItemOf<F extends (...args: never[]) => Promise<{ items: unknown[] }>> = Awaited<ReturnType<F>>["items"][number];

export type AdminStats = Awaited<ReturnType<typeof adminStats>>;
export type AdminReport = ItemOf<typeof adminListReports>;
export type AdminPost = ItemOf<typeof adminListPosts>;
export type AdminComment = ItemOf<typeof adminListComments>;
export type AdminUser = ItemOf<typeof adminListUsers>;
export type AdminUserDetail = Awaited<ReturnType<typeof adminGetUser>>;
export type AuditLog = ItemOf<typeof listAuditLogs>;
export type PendingWarning = Awaited<ReturnType<typeof pendingWarnings>>[number];

export type AdminPage<T> = Page<T>;

export type AdminThemes = { current: ThemeDTO; upcoming: ThemeDTO[]; past: ThemeDTO[]; serverNow: string };

export type PoolEntry = {
  id: string;
  title: string;
  description: string;
  template: ThemeDTO["template"];
  accent: string;
  enabled: boolean;
  timesUsed: number;
  lastUsedAt: string | null;
};

export type AdminEvents = {
  items: EventDTO[];
  auto: { enabled: boolean; nextAutoAt: string | null };
  presets: { key: string; name: string; description: string }[];
  serverNow: string;
};

export type AdminSettings = {
  dailyPostLimit: number | null;
  autoHideReports: number;
  eventAuto: { enabled: boolean; nextAutoAt: string | null };
};

export type ArtPreviewResponse = { art: PixelArt };
