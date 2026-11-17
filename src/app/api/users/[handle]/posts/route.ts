import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getActiveUserByHandle } from "@/server/services/users";
import { listUserPosts } from "@/server/services/posts";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/users/[handle]/posts">) => {
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const user = await getActiveUserByHandle(handle);
  const cursor = req.nextUrl.searchParams.get("cursor");
  return json(await listUserPosts(viewer, user.id, await now(), cursor));
});
