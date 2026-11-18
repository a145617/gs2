// サーバー側の環境変数をまとめて扱う。
export const env = {
  get databaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていません（.env.local を確認してください）");
    return url;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  /** デバッグモード。true のとき全ユーザーにデバッグパネルを表示する */
  get debugMode(): boolean {
    return process.env.DEBUG_MODE === "true";
  },
  get storageDriver(): "local" | "blob" {
    return process.env.STORAGE_DRIVER === "blob" ? "blob" : "local";
  },
};
