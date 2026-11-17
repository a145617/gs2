import { defineConfig } from "vitest/config";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI では環境変数をそのまま使う
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 統合テストは同じテスト用DBを使うので並列実行しない
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/support/setup.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
  },
});
