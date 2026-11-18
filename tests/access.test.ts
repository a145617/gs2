import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { closeDb } from "@/server/db/client";
import { proxy } from "@/proxy";
import { POST as access } from "@/app/api/access/route";
import { ACCESS_COOKIE, accessToken, hasAccess, isCorrectCode } from "@/server/access";
import { resetDb } from "./support/db";

const BASE = "http://localhost:3000";
const req = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`${BASE}${path}`, {
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  });
const isPassThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";
const post = (code: unknown) =>
  access(
    new NextRequest(`${BASE}/api/access`, {
      method: "POST",
      headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
      body: JSON.stringify({ code }),
    }),
    undefined as never,
  );

describe("合言葉（パスフレーズ）による入場制限（ACCESS_CODE）", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.ACCESS_CODE;
  });
  afterEach(() => {
    delete process.env.ACCESS_CODE;
  });
  afterAll(closeDb);

  it("合言葉が未設定なら制限しない（これまでどおり、ログインしていなければログイン画面へ）", async () => {
    expect(await hasAccess(undefined)).toBe(true);
    const page = await proxy(req("/explore"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`${BASE}/login?next=%2Fexplore`);
    expect(isPassThrough(await proxy(req("/api/themes/current")))).toBe(true);
    expect(isPassThrough(await proxy(req("/media/posts/x/sm.webp")))).toBe(true);
    const res = await post("なんでも");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, required: false });
  });

  it("合言葉が設定されていれば、入力するまで画面は入力画面へ、API・画像は 401 になる", async () => {
    process.env.ACCESS_CODE = "ひとこま2026";
    const page = await proxy(req("/explore", { hk_session: "x" }));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`${BASE}/access?next=%2Fexplore`);
    expect((await proxy(req("/"))).headers.get("location")).toBe(`${BASE}/access`);
    for (const path of ["/api/me", "/api/debug/status", "/media/posts/x/sm.webp", "/login"]) {
      const res = await proxy(req(path));
      if (path.startsWith("/login")) {
        expect(res.headers.get("location")).toBe(`${BASE}/access?next=%2Flogin`);
        continue;
      }
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("access_code_required");
    }
    // 入力画面とその API、データを含まないオフライン画面は開ける
    expect(isPassThrough(await proxy(req("/access")))).toBe(true);
    expect(isPassThrough(await proxy(req("/api/access")))).toBe(true);
    expect(isPassThrough(await proxy(req("/offline")))).toBe(true);
    // 違う値の Cookie では入れない
    expect((await proxy(req("/api/me", { [ACCESS_COOKIE]: "0".repeat(64) }))).status).toBe(401);
  });

  it("正しい合言葉を入力すると Cookie が保存され、それ以降は普通に使える（合言葉を変えると無効になる）", async () => {
    process.env.ACCESS_CODE = "ひとこま2026";
    const wrong = await post("ちがう");
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.message).toBe("合言葉が違います");
    expect(wrong.headers.get("set-cookie")).toBeNull();

    // 前後の空白・全角英数の違いは許す
    const ok = await post("  ひとこま２０２６ ");
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    const token = await accessToken("ひとこま2026");
    expect(cookie).toContain(`${ACCESS_COOKIE}=${token}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain("ひとこま");

    expect(isPassThrough(await proxy(req("/api/me", { [ACCESS_COOKIE]: token })))).toBe(true);
    // 画面は、合言葉のあとにいつものログインの確認が行われる
    expect((await proxy(req("/explore", { [ACCESS_COOKIE]: token }))).headers.get("location")).toBe(`${BASE}/login?next=%2Fexplore`);
    expect(isPassThrough(await proxy(req("/explore", { [ACCESS_COOKIE]: token, hk_session: "x" })))).toBe(true);

    process.env.ACCESS_CODE = "あたらしい合言葉";
    expect((await proxy(req("/api/me", { [ACCESS_COOKIE]: token }))).status).toBe(401);
    expect(await isCorrectCode("ひとこま2026")).toBe(false);
    expect(await isCorrectCode(" あたらしい合言葉 ")).toBe(true);
  });

  it("合言葉の総当たりは、同じ接続元から15分に10回までに制限する", async () => {
    process.env.ACCESS_CODE = "ひとこま2026";
    for (let i = 0; i < 10; i++) expect((await post(`ちがう${i}`)).status).toBe(400);
    const blocked = await post("ひとこま2026");
    expect(blocked.status).toBe(429);
  });
});
