import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { getActiveUserByHandle, toPublicUser } from "@/server/services/users";
import type { ProfileResponse } from "@/lib/types";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/users/[handle]">) => {
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const user = await getActiveUserByHandle(handle);
  const body: ProfileResponse = { user: toPublicUser(user), isMe: user.id === viewer.id };
  return json(body);
});
