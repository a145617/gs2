import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { ensureTestAdmin, ensureTestUsers, listTestUsers } from "@/server/services/debug";
import { mediaUrl } from "@/server/storage";

const schema = z.discriminatedUnion("kind", [
  /** テスト用ユーザーを n 人そろえる */
  z.object({ kind: z.literal("users"), count: z.number().int().min(1).max(12) }),
  /** 管理者機能の確認用のテスト管理者 */
  z.object({ kind: z.literal("admin") }),
]);

async function listing() {
  const rows = await listTestUsers();
  return {
    items: rows.map((u) => ({ id: u.id, handle: u.handle, displayName: u.displayName, avatarUrl: mediaUrl(u.avatarKey), role: u.role })),
  };
}

/** デバッグ: テスト用ユーザーの一覧（切り替え先） */
export const GET = route(async (req: NextRequest) => {
  await requireDebug(req);
  return json(await listing());
});

export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  const input = schema.parse(await readJson(req));
  if (input.kind === "users") await ensureTestUsers(input.count);
  else await ensureTestAdmin();
  return json(await listing(), { status: 201 });
});
