import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireAdmin } from "@/server/http/viewer";
import { adminListPosts } from "@/server/services/admin";

/** 投稿の一覧（q=タイトル・キャプション・ハッシュタグ、status=visible|hidden|reported） */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  return json(await adminListPosts(sp.get("q") ?? "", sp.get("status"), sp.get("cursor")));
});
