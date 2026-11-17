import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { getActiveUserByHandle } from "@/server/services/users";
import { mute, unmute } from "@/server/services/moderation";

type Ctx = RouteContext<"/api/users/[handle]/mute">;

/** ミュートする（このユーザーの投稿・コメントを表示しない） */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const target = await getActiveUserByHandle(handle);
  return json(await mute(viewer, target.id));
});

export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  const { handle } = await ctx.params;
  const target = await getActiveUserByHandle(handle);
  return json(await unmute(viewer, target.id));
});
