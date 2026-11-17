import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { bookmarkPost, unbookmarkPost } from "@/server/services/social";

type Ctx = RouteContext<"/api/posts/[id]/bookmark">;

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json(await bookmarkPost(viewer, id, await now()));
});

export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json(await unbookmarkPost(viewer, id));
});
