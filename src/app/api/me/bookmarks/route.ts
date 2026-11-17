import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { listBookmarks } from "@/server/services/social";

/** 自分がブックマークした投稿 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  return json(await listBookmarks(viewer, await now(), req.nextUrl.searchParams.get("cursor")));
});
