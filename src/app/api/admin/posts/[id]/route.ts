import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { adminDeletePost, adminEditPost, adminSetPostStatus } from "@/server/services/admin";
import { postUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/posts/[id]">;

/** 任意の投稿を編集する（タイトル・キャプション・ハッシュタグ）。投稿者にお知らせが届く */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = postUpdateSchema.parse(await readJson(req));
  return json({ post: await adminEditPost(admin, id, patch, await now()) });
});

const actionSchema = z.object({
  action: z.enum(["hide", "restore", "delete"]),
  reason: z.string().trim().max(300, "理由は300文字以内にしてください").default(""),
});

/** 任意の投稿を非表示・復元・削除する */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { action, reason } = actionSchema.parse(await readJson(req));
  if (action === "delete") await adminDeletePost(admin, id, reason);
  else await adminSetPostStatus(admin, id, action === "hide" ? "hidden" : "visible", reason);
  return json({ ok: true });
});
