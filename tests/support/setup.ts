// すべてのテストの前に読み込まれる。統合テストはテスト用DBに接続する。
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = ".data/test-uploads";
process.env.DEBUG_MODE = "true";
