import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getEventDetail } from "@/server/services/events";

/** イベントの詳細（ピクセルアートの全マスと、閲覧者の担当色） */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/events/[id]">) => {
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  return json(await getEventDetail(viewer, id, await now()));
});
