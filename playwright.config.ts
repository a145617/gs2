import { defineConfig, devices } from "@playwright/test";

/**
 * ブラウザでのE2Eテスト。
 * スマートフォンでの利用を想定し、Android(Chrome) / iPhone(Safari=WebKit) / Firefox の3種類で同じテストを実行する。
 * 事前に `npm run db` で組み込みPostgreSQLを起動しておくこと。
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
    {
      name: "firefox-mobile",
      use: {
        browserName: "firefox",
        viewport: { width: 393, height: 851 },
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
