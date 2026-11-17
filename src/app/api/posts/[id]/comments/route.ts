import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { now } from "@/server/clock";
import { addComment, COMMENT_MAX, listComments } from "@/server/services/social";

type Ctx = RouteContext<"/api/posts/[id]/comments">;

export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  const cursor = req.nextUrl.searchParams.get("cursor");
  return json(await listComments(viewer, id, await now(), cursor));
});

const bodySchema = z.object({
  body: z.string().trim().min(1, "コメントを入力してください").max(COMMENT_MAX, `コメントは${COMMENT_MAX}文字以内にしてください`),
});

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`comment:${viewer.id}`, 60, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const { id } = await ctx.params;
  const { body } = bodySchema.parse(await readJson(req));
  return json({ comment: await addComment(viewer, id, body, await now()) }, { status: 201 });
});
