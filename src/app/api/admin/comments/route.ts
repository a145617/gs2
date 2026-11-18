import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { adminListComments } from "@/server/services/admin";

/** コメントの一覧（q=本文の検索語） */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  return json(await adminListComments(sp.get("q") ?? "", sp.get("cursor")));
});
