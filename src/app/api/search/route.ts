import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { searchPosts, searchTags, searchUsers, trendingTags } from "@/server/services/search";

/**
 * 検索。type=posts（タイトル・キャプション・ハッシュタグ）/ users / tags / trending
 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 100);
  const type = sp.get("type") ?? "posts";
  const at = await now();
  if (type === "users") return json({ items: await searchUsers(viewer, q), nextCursor: null });
  if (type === "tags") return json({ items: await searchTags(q) });
  if (type === "trending") return json({ items: await trendingTags(at) });
  return json(await searchPosts(viewer, q, at, sp.get("cursor")));
});
