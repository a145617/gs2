import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { env } from "./env";

/** デバッグモードでは動作確認（自動テストで何度も登録する等）のため上限を緩める */
const DEBUG_MULTIPLIER = 50;

/**
 * 固定ウィンドウ方式の回数制限。key ごとに windowSec 秒で limit 回まで。
 * サーバーが複数台（サーバーレス）でも効くように DB に記録する。
 */
export async function hitRateLimit(
  key: string,
  baseLimit: number,
  windowSec: number,
  opts: { strict?: boolean } = {},
): Promise<{ ok: boolean; count: number; retryAfterSec: number }> {
  const limit = env.debugMode && !opts.strict ? baseLimit * DEBUG_MULTIPLIER : baseLimit;
  const rows = await db.execute<{ count: number; window_start: Date | string }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE rate_limits.window_start END
    RETURNING count, window_start
  `);
  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const start = new Date(row?.window_start ?? Date.now()).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((start + windowSec * 1000 - Date.now()) / 1000));
  return { ok: count <= limit, count, retryAfterSec };
}
