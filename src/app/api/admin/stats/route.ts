import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { adminStats } from "@/server/services/admin";

/** 管理画面のトップに出す件数 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  return json(await adminStats());
});
