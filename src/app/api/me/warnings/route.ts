import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { pendingWarnings } from "@/server/services/admin";

/** 管理者からの、まだ確認していない警告 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  return json({ items: await pendingWarnings(viewer.id) });
});
