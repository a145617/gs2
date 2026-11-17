import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings } from "./db/schema";

/** 管理画面などで変更できるアプリ設定 */
export const SETTING_KEYS = {
  /** 1日（お題1つ）あたりの投稿数の上限。null なら無制限 */
  dailyPostLimit: "posts.dailyLimit",
  /** 何件の通報で投稿を自動的に非表示にするか */
  autoHideReports: "reports.autoHideThreshold",
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row ? (row.value as T) : fallback;
}

/** 設定を保存する。null / undefined を渡すと設定を消し、既定値に戻す */
export async function setSetting(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
