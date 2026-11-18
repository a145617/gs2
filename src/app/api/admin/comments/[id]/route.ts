import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { adminDeleteComment, adminEditComment, adminSetCommentStatus } from "@/server/services/admin";
import { COMMENT_MAX } from "@/server/services/social";

type Ctx = RouteContext<"/api/admin/comments/[id]">;

const editSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください")
    .max(COMMENT_MAX, `コメントは${COMMENT_MAX}文字以内にしてください`),
});

/** 任意のコメントを編集する。投稿者にお知らせが届く */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { body } = editSchema.parse(await readJson(req));
  return json({ comment: await adminEditComment(admin, id, body, await now()) });
});

const actionSchema = z.object({
  action: z.enum(["hide", "restore", "delete"]),
  reason: z.string().trim().max(300, "理由は300文字以内にしてください").default(""),
});

/** 任意のコメントを非表示・復元・削除する */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { action, reason } = actionSchema.parse(await readJson(req));
  if (action === "delete") await adminDeleteComment(admin, id, reason);
  else await adminSetCommentStatus(admin, id, action === "hide" ? "hidden" : "visible");
  return json({ ok: true });
});
