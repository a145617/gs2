import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { adminListReports } from "@/server/services/admin";

/** 通報の一覧（status=open|resolved|dismissed、既定は未対応） */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const s = req.nextUrl.searchParams.get("status");
  const status = s === "resolved" || s === "dismissed" ? s : "open";
  return json(await adminListReports(status, req.nextUrl.searchParams.get("cursor")));
});
