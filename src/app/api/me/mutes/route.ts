import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { listMutes } from "@/server/services/moderation";

/** 自分がミュートしているユーザー */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  return json({ items: await listMutes(viewer), nextCursor: null });
});
