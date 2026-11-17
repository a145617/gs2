import type { NextRequest } from "next/server";
import { route, json, notFound } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { getActiveUserByHandle } from "@/server/services/users";
import { listFollowUsers } from "@/server/services/social";

/** フォロワー（followers）・フォロー中（following）の一覧 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/users/[handle]/[kind]">) => {
  const viewer = await requireViewer(req);
  const { handle, kind } = await ctx.params;
  if (kind !== "followers" && kind !== "following") throw notFound();
  const user = await getActiveUserByHandle(handle);
  return json(await listFollowUsers(viewer, user.id, kind, req.nextUrl.searchParams.get("cursor")));
});
