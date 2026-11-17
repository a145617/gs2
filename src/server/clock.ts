import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { appSettings } from "./db/schema";
import { env } from "./env";

/**
 * アプリ内の「現在時刻」。
 * デバッグモードでは仮想時計（実時間からのずれ）を設定でき、
 * 朝5時のお題切り替えやイベントの日時を待たずに確認できる。
 */
const KEY = "debug.clockOffsetMs";
let cache: { offset: number; at: number } | null = null;

export async function getClockOffsetMs(): Promise<number> {
  if (!env.debugMode) return 0;
  if (cache && Date.now() - cache.at < 1000) return cache.offset;
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  const offset = Number(row?.value ?? 0) || 0;
  cache = { offset, at: Date.now() };
  return offset;
}

export async function setClockOffsetMs(offset: number): Promise<void> {
  const value = Math.round(offset);
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  cache = { offset: value, at: Date.now() };
}

/** アプリ内の現在時刻 */
export async function now(): Promise<Date> {
  return new Date(Date.now() + (await getClockOffsetMs()));
}
