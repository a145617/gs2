import type { NextRequest } from "next/server";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { deletePost, getPost, updatePost } from "@/server/services/posts";
import { postUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/posts/[id]">;

export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json({ post: await getPost(viewer, id, await now()) });
});

/** 自分の投稿のタイトル・キャプション・ハッシュタグを編集 */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  const patch = postUpdateSchema.parse(await readJson(req));
  return json({ post: await updatePost(viewer, id, patch, await now()) });
});

/** 自分の投稿を削除 */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  await deletePost(viewer, id);
  return json({ ok: true });
});
