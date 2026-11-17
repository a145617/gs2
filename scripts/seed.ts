export {};

// 初期データを投入する（何度実行しても安全）: npm run seed
//  - お題の候補（毎朝5時に、この中から自動で選ばれる）
//  - 初期管理者（ADMIN_EMAIL / ADMIN_PASSWORD）
try {
  process.loadEnvFile(".env.local");
} catch {
  // 本番では環境変数をそのまま使う
}

const { ensureAdminFromEnv } = await import("../src/server/services/users");
const { seedThemePool } = await import("../src/server/services/themes");
const { closeDb } = await import("../src/server/db/client");

try {
  const added = await seedThemePool();
  console.log(`[seed] お題の候補を ${added} 件追加しました`);
  const admin = await ensureAdminFromEnv();
  console.log(
    admin
      ? `[seed] 管理者アカウント: ${admin.email}（@${admin.handle}）`
      : "[seed] ADMIN_EMAIL / ADMIN_PASSWORD が未設定のため、管理者は作成しませんでした",
  );
} finally {
  await closeDb();
}
