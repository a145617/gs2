import type { NextRequest } from "next/server";
import { route, json, tooMany } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { hitRateLimit } from "@/server/rate-limit";
import { now } from "@/server/clock";
import { getActiveUserByHandle } from "@/server/services/users";
import { follow, unfollow } from "@/server/services/social";

type Ctx = RouteContext<"/api/users/[handle]/follow">;

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const limit = await hitRateLimit(`follow:${viewer.id}`, 120, 60 * 60);
  if (!limit.ok) throw tooMany(limit.retryAfterSec);
  const { handle } = await ctx.params;
  const target = await getActiveUserByHandle(handle);
  return json(await follow(viewer, target.id, await now()));
});

export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const target = await getActiveUserByHandle(handle);
  return json(await unfollow(viewer, target.id));
});
