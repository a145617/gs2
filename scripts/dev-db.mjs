// ローカル開発用の組み込みPostgreSQLを起動する（Docker・DBのインストール不要）。
// 使い方: npm run db      … 起動（Ctrl+Cで停止）
// データは .data/pg に保存される。
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.DEV_DB_PORT ?? 54329);
const databaseDir = path.resolve(".data/pg");
const databases = ["hitokoma", "hitokoma_test"];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (e) => console.error("[pg]", e),
});

const fresh = !existsSync(path.join(databaseDir, "PG_VERSION"));
if (fresh) {
  console.log("[dev-db] 初回のため初期化しています…");
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
for (const name of databases) {
  const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (r.rowCount === 0) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log(`[dev-db] データベース ${name} を作成しました`);
  }
}
await client.end();

console.log(`[dev-db] 起動しました: postgres://postgres:postgres@localhost:${port}/hitokoma`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\n[dev-db] 停止しています…");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// プロセスを生かしておく
setInterval(() => {}, 1 << 30);
