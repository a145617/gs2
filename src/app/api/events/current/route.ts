import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getCurrentEventInfo } from "@/server/services/events";

/** 開催中のイベントと、閲覧者に割り当てられた色（自動開催の確認もここで行う） */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  return json(await getCurrentEventInfo(viewer, await now()));
});
