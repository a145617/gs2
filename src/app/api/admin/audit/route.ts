import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { listAuditLogs } from "@/server/services/admin";

/** 管理者の操作の記録（新しい順） */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  return json(await listAuditLogs(req.nextUrl.searchParams.get("cursor")));
});
