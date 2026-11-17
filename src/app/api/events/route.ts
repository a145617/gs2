import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { listEvents } from "@/server/services/events";

/** これまでのイベント */
export const GET = route(async (req: NextRequest) => {
  await requireViewer(req);
  return json({ items: await listEvents(await now()) });
});
