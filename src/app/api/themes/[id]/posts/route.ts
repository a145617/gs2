import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, notFound } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getThemeById } from "@/server/services/themes";
import { listThemePosts } from "@/server/services/posts";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/themes/[id]/posts">) => {
  const viewer = await requireViewer(req);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw notFound("お題が見つかりませんでした");
  await getThemeById(id);
  const cursor = req.nextUrl.searchParams.get("cursor");
  return json(await listThemePosts(viewer, id, await now(), cursor));
});
