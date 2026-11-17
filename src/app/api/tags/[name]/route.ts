import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getHashtag, listTagPosts } from "@/server/services/posts";
import { normalizeTag } from "@/lib/hashtags";

/** ハッシュタグの付いた投稿 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/tags/[name]">) => {
  const viewer = await requireViewer(req);
  const { name } = await ctx.params;
  const tag = normalizeTag(decodeURIComponent(name));
  const [info, page] = await Promise.all([
    getHashtag(tag),
    listTagPosts(viewer, tag, await now(), req.nextUrl.searchParams.get("cursor")),
  ]);
  return json({ tag, postCount: info?.postCount ?? 0, ...page });
});
