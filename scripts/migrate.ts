// DBマイグレーションを適用する（本番デプロイ時にも実行される）
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

try {
  process.loadEnvFile(".env.local");
} catch {
  // 本番では環境変数をそのまま使う
}

const url = process.argv[2] === "--test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL が設定されていません");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("[migrate] マイグレーションを適用しました");
} finally {
  await sql.end({ timeout: 5 });
}
