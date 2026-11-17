import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getActiveUserByHandle } from "@/server/services/users";
import { listUserPosts } from "@/server/services/posts";
import { isMuted } from "@/server/services/moderation";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/users/[handle]/posts">) => {
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const user = await getActiveUserByHandle(handle);
  // ミュート中のユーザーの投稿は表示しない
  if (user.id !== viewer.id && (await isMuted(viewer.id, user.id))) {
    return json({ items: [], nextCursor: null, muted: true });
  }
  const cursor = req.nextUrl.searchParams.get("cursor");
  return json(await listUserPosts(viewer, user.id, await now(), cursor));
});
