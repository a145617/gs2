import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { closeDb, db } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { hitRateLimit } from "@/server/rate-limit";
import {
  authenticate,
  changePassword,
  createUser,
  deleteAccount,
  ensureAdminFromEnv,
  getActiveUserByHandle,
  removeAvatar,
  setAvatar,
  updateProfile,
} from "@/server/services/users";
import { getObject } from "@/server/storage";
import { signupSchema } from "@/lib/validation";
import { resetDb } from "./support/db";

describe("アカウント・ログイン（仕様: アカウント、ログイン機能 / アイコン・ユーザー名・ユーザーID）", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("パスワードはハッシュ化して保存し、照合できる", async () => {
    const h = await hashPassword("correct horse");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("登録するとユーザーIDが自動で割り振られ、重複しない", async () => {
    const a = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    const b = await createUser({ email: "b@example.com", password: "password1", displayName: "い" });
    expect(a.handle).toMatch(/^[a-z2-9]{8}$/);
    expect(b.handle).not.toBe(a.handle);
    expect((await getActiveUserByHandle(a.handle)).id).toBe(a.id);
  });

  it("同じメールアドレスでは登録できない", async () => {
    await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    await expect(
      createUser({ email: "a@example.com", password: "password2", displayName: "い" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("入力チェック: メール形式・パスワード長・ユーザー名", () => {
    expect(signupSchema.safeParse({ email: "x", password: "password1", displayName: "a" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.jp", password: "short", displayName: "a" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.jp", password: "password1", displayName: "   " }).success).toBe(false);
    const ok = signupSchema.parse({ email: " A@B.JP ", password: "password1", displayName: " 花子 " });
    expect(ok).toEqual({ email: "a@b.jp", password: "password1", displayName: "花子" });
  });

  it("正しいパスワードでのみログインでき、セッションが有効になる", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    await expect(authenticate("a@example.com", "nope")).rejects.toMatchObject({ status: 401 });
    await expect(authenticate("x@example.com", "password1")).rejects.toMatchObject({ status: 401 });
    const user = await authenticate("a@example.com", "password1");
    expect(user.id).toBe(u.id);

    const { token } = await createSession(user.id);
    const v = await validateSessionToken(token);
    expect(v?.user.id).toBe(u.id);
    expect(await validateSessionToken("invalid-token")).toBeNull();
  });

  it("期限切れのセッションは無効", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    const { token } = await createSession(u.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, u.id));
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("ユーザー名・自己紹介を変更できる（ユーザーIDは変わらない）", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    const after = await updateProfile(u.id, { displayName: "新しい名前", bio: "よろしく" });
    expect(after.displayName).toBe("新しい名前");
    expect(after.bio).toBe("よろしく");
    expect(after.handle).toBe(u.handle);
  });

  it("アイコン画像を変更・削除できる（正方形のWebPに変換して保存）", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3366cc" } })
      .png()
      .toBuffer();
    const withAvatar = await setAvatar(u.id, png);
    expect(withAvatar.avatarKey).toMatch(/^avatars\//);
    const stored = await getObject(withAvatar.avatarKey!);
    expect(stored?.contentType).toBe("image/webp");
    const meta = await sharp(Buffer.from(stored!.body as Uint8Array)).metadata();
    expect([meta.width, meta.height]).toEqual([320, 320]);

    const removed = await removeAvatar(u.id);
    expect(removed.avatarKey).toBeNull();
    expect(await getObject(withAvatar.avatarKey!)).toBeNull();
  });

  it("パスワードを変更すると新しいパスワードでログインできる", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    await expect(changePassword(u.id, "wrong", "password2")).rejects.toMatchObject({ status: 400 });
    await changePassword(u.id, "password1", "password2");
    await expect(authenticate("a@example.com", "password1")).rejects.toMatchObject({ status: 401 });
    expect((await authenticate("a@example.com", "password2")).id).toBe(u.id);
  });

  it("アカウントを削除するとログインできず、セッションも消える", async () => {
    const u = await createUser({ email: "a@example.com", password: "password1", displayName: "あ" });
    const { token } = await createSession(u.id);
    await deleteAccount(u.id);
    expect(await validateSessionToken(token)).toBeNull();
    await expect(authenticate("a@example.com", "password1")).rejects.toMatchObject({ status: 401 });
    await expect(getActiveUserByHandle(u.handle)).rejects.toMatchObject({ status: 404 });
    // 同じメールアドレスで登録し直せる
    await createUser({ email: "a@example.com", password: "password1", displayName: "再登録" });
  });

  it("環境変数から初期管理者を作成する（何度実行しても1人）", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "admin-password";
    const a = await ensureAdminFromEnv();
    const b = await ensureAdminFromEnv();
    expect(a?.role).toBe("admin");
    expect(b?.id).toBe(a?.id);
  });

  it("回数制限: 上限を超えると拒否される", async () => {
    for (let i = 0; i < 3; i++) expect((await hitRateLimit("t:key", 3, 60, { strict: true })).ok).toBe(true);
    const over = await hitRateLimit("t:key", 3, 60, { strict: true });
    expect(over.ok).toBe(false);
    expect(over.retryAfterSec).toBeGreaterThan(0);
  });
});
