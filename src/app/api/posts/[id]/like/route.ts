import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { likePost, unlikePost } from "@/server/services/social";

type Ctx = RouteContext<"/api/posts/[id]/like">;

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json(await likePost(viewer, id, await now()));
});

export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json(await unlikePost(viewer, id));
});
