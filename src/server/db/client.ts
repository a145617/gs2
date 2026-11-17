import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { env } from "../env";

type Sql = ReturnType<typeof postgres>;

function createSql(url: string): Sql {
  // Neon のプーラー（トランザクションモード）でも動くよう prepare: false にする
  return postgres(url, {
    max: env.isProduction ? 5 : 10,
    prepare: false,
    onnotice: () => {},
  });
}

const createDb = (sql: Sql) => drizzle(sql, { schema });
export type Database = ReturnType<typeof createDb>;

// 接続プールは開発時のホットリロードをまたいで globalThis に保持する（接続が増え続けないように）。
// Drizzle のインスタンスはこのモジュールと一緒に作り直し、スキーマの変更に追従させる。
const g = globalThis as unknown as { __hitokomaSql?: Sql };
let current: Database | null = null;

function instance(): Database {
  if (!current) {
    g.__hitokomaSql ??= createSql(env.databaseUrl);
    current = createDb(g.__hitokomaSql);
  }
  return current;
}

/** アプリ全体で使うDB（最初のアクセス時に接続する） */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = instance() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** テストやスクリプトから接続を閉じる */
export async function closeDb() {
  if (g.__hitokomaSql) {
    await g.__hitokomaSql.end({ timeout: 5 });
    g.__hitokomaSql = undefined;
  }
  current = null;
}
