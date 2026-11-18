import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, notFound } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { adminDeleteUser, adminEditProfile, adminGetUser, setUserRole, warnUser } from "@/server/services/admin";
import { bioSchema, displayNameSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/users/[id]">;

const isUuid = (id: string) => /^[0-9a-f-]{36}$/.test(id);

/** アカウントの詳細（警告の履歴・投稿数） */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("ユーザーが見つかりませんでした");
  return json(await adminGetUser(id));
});

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("warn"),
    message: z.string().trim().min(1, "警告の内容を入力してください").max(500, "警告は500文字以内にしてください"),
  }),
  z.object({ action: z.literal("delete"), reason: z.string().trim().max(300, "理由は300文字以内にしてください").default("") }),
  z.object({ action: z.literal("role"), role: z.enum(["user", "admin"]) }),
  z.object({
    action: z.literal("profile"),
    displayName: displayNameSchema.optional(),
    bio: bioSchema.optional(),
    removeAvatar: z.boolean().optional(),
  }),
]);

/** アカウントへの警告・削除・権限の変更・プロフィールの修正 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("ユーザーが見つかりませんでした");
  const input = schema.parse(await readJson(req));
  switch (input.action) {
    case "warn":
      await warnUser(admin, id, input.message);
      break;
    case "delete":
      await adminDeleteUser(admin, id, input.reason);
      break;
    case "role":
      await setUserRole(admin, id, input.role);
      break;
    case "profile":
      await adminEditProfile(admin, id, { displayName: input.displayName, bio: input.bio, removeAvatar: input.removeAvatar });
      break;
  }
  return json({ ok: true });
});
