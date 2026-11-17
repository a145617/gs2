import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { env } from "../env";

type Sql = ReturnType<typeof postgres>;

function createDb(url: string) {
  // Neon のプーラー（トランザクションモード）でも動くよう prepare: false にする
  const sql: Sql = postgres(url, {
    max: env.isProduction ? 5 : 10,
    prepare: false,
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export type Database = ReturnType<typeof createDb>["db"];

// 開発時のホットリロードで接続が増え続けないよう globalThis に保持する
const g = globalThis as unknown as { __hitokomaDb?: ReturnType<typeof createDb> };

function instance() {
  if (!g.__hitokomaDb) g.__hitokomaDb = createDb(env.databaseUrl);
  return g.__hitokomaDb;
}

/** アプリ全体で使うDB（最初のアクセス時に接続する） */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = instance().db as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** テストやスクリプトから接続を閉じる */
export async function closeDb() {
  if (g.__hitokomaDb) {
    await g.__hitokomaDb.sql.end({ timeout: 5 });
    g.__hitokomaDb = undefined;
  }
}
