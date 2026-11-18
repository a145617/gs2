import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { COMMENT_MAX, deleteComment, editComment } from "@/server/services/social";

type Ctx = RouteContext<"/api/comments/[id]">;

const bodySchema = z.object({
  body: z.string().trim().min(1, "コメントを入力してください").max(COMMENT_MAX, `コメントは${COMMENT_MAX}文字以内にしてください`),
});

/** 自分のコメントを編集 */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  const { body } = bodySchema.parse(await readJson(req));
  return json({ comment: await editComment(viewer, id, body, await now()) });
});

/** 自分のコメント、または自分の投稿へのコメントを削除 */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  await deleteComment(viewer, id);
  return json({ ok: true });
});
