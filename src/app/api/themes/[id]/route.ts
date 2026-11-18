import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, notFound } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getThemeById, toThemeDTO } from "@/server/services/themes";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/themes/[id]">) => {
  await requireViewer(req);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw notFound("お題が見つかりませんでした");
  const at = await now();
  const theme = await getThemeById(id);
  if (theme.startsAt > at) throw notFound("お題が見つかりませんでした");
  return json({ theme: toThemeDTO(theme, at) });
});
