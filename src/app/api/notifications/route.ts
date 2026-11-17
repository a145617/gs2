import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireViewer } from "@/server/http/viewer";
import { listNotifications, markAllRead } from "@/server/services/notifications";

/** お知らせの一覧 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  return json(await listNotifications(viewer.id, req.nextUrl.searchParams.get("cursor")));
});

/** すべて既読にする */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireViewer(req);
  await markAllRead(viewer.id);
  return json({ ok: true });
});
