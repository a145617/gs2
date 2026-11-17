import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/** テスト用DBの全テーブルを空にする */
export async function resetDb() {
  const rows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = rows.map((r) => `"${r.tablename}"`);
  if (names.length > 0) {
    await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`));
  }
}
