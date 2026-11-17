import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { getActiveUserByHandle, toPublicUser } from "@/server/services/users";
import { followState, profileCounts } from "@/server/services/social";
import type { ProfileResponse } from "@/lib/types";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/users/[handle]">) => {
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const user = await getActiveUserByHandle(handle);
  const [counts, state] = await Promise.all([profileCounts(user.id), followState(viewer.id, user.id)]);
  const body: ProfileResponse = {
    user: toPublicUser(user),
    isMe: user.id === viewer.id,
    counts,
    following: state.following,
    followsMe: state.followsMe,
    muted: false,
  };
  return json(body);
});
