import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { adminListUsers } from "@/server/services/admin";

/** アカウントの一覧（q=ユーザー名・ユーザーID・メールアドレス） */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  return json(await adminListUsers(sp.get("q") ?? "", sp.get("cursor")));
});
