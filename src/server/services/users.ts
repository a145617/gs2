import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users, type UserRow } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { deleteUserSessions } from "../auth/session";
import { generateHandle, randomId } from "../auth/tokens";
import { conflict, notFound, unauthorized, badRequest } from "../http/respond";
import { deleteObject, mediaUrl, putObject } from "../storage";
import { processAvatar } from "../images";
import type { Me, PublicUser } from "@/lib/types";

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: mediaUrl(u.avatarKey),
    bio: u.bio,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toMe(u: UserRow): Me {
  return { ...toPublicUser(u), email: u.email, isTestUser: u.isTestUser };
}

/** ユーザーIDを重複しないように割り振る */
async function uniqueHandle(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const handle = generateHandle();
    const hit = await db.query.users.findFirst({ where: eq(users.handle, handle), columns: { id: true } });
    if (!hit) return handle;
  }
  throw new Error("ユーザーIDの割り当てに失敗しました");
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  role?: "user" | "admin";
  isTestUser?: boolean;
}): Promise<UserRow> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
  if (existing) throw conflict("このメールアドレスはすでに登録されています", "email_taken");
  const passwordHash = await hashPassword(input.password);
  const handle = await uniqueHandle();
  try {
    const [row] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        handle,
        role: input.role ?? "user",
        isTestUser: input.isTestUser ?? false,
      })
      .returning();
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw conflict("このメールアドレスはすでに登録されています", "email_taken");
    }
    throw e;
  }
}

export async function authenticate(email: string, password: string): Promise<UserRow> {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  // 存在しないメールでも同程度の時間をかけ、登録有無を推測されにくくする
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "scrypt$15$8$3$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!user || !ok || user.status !== "active") {
    throw unauthorized("メールアドレスまたはパスワードが違います");
  }
  return user;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  return (await db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
}

export async function getActiveUserByHandle(handle: string): Promise<UserRow> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.handle, handle.toLowerCase()), eq(users.status, "active")),
  });
  if (!user) throw notFound("ユーザーが見つかりませんでした");
  return user;
}

export async function updateProfile(userId: string, patch: { displayName?: string; bio?: string }): Promise<UserRow> {
  const values: Partial<UserRow> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) values.displayName = patch.displayName;
  if (patch.bio !== undefined) values.bio = patch.bio;
  const [row] = await db.update(users).set(values).where(eq(users.id, userId)).returning();
  if (!row) throw notFound();
  return row;
}

export async function setAvatar(userId: string, image: Buffer): Promise<UserRow> {
  const user = await getUserById(userId);
  if (!user) throw notFound();
  const webp = await processAvatar(image);
  const key = `avatars/${userId}/${randomId(16)}.webp`;
  await putObject(key, webp, "image/webp");
  const [row] = await db
    .update(users)
    .set({ avatarKey: key, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  await deleteObject(user.avatarKey);
  return row;
}

export async function removeAvatar(userId: string): Promise<UserRow> {
  const user = await getUserById(userId);
  if (!user) throw notFound();
  const [row] = await db
    .update(users)
    .set({ avatarKey: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  await deleteObject(user.avatarKey);
  return row;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await getUserById(userId);
  if (!user) throw notFound();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest("現在のパスワードが違います", { fields: { currentPassword: "現在のパスワードが違います" } });
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * アカウントを削除する（退会・管理者による削除の共通処理）。
 * 個人情報を消し、ログインできなくする。投稿などは各機能側で非表示扱いにする。
 */
export async function deleteAccount(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user || user.status === "deleted") return;
  await db
    .update(users)
    .set({
      status: "deleted",
      deletedAt: new Date(),
      email: `deleted+${user.id}@deleted.invalid`,
      passwordHash: "deleted",
      displayName: "削除されたユーザー",
      bio: "",
      avatarKey: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await deleteObject(user.avatarKey);
  await deleteUserSessions(userId);
}

/** 管理者がまだいなければ、環境変数の情報で初期管理者を作る */
export async function ensureAdminFromEnv(): Promise<UserRow | null> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    if (existing.role !== "admin") {
      const [row] = await db.update(users).set({ role: "admin" }).where(eq(users.id, existing.id)).returning();
      return row;
    }
    return existing;
  }
  return createUser({ email, password, displayName: "管理者", role: "admin" });
}

export async function countActiveUsers(excludeTest = false): Promise<number> {
  const where = excludeTest
    ? and(eq(users.status, "active"), eq(users.isTestUser, false))
    : and(eq(users.status, "active"), ne(users.handle, ""));
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return row?.n ?? 0;
}
