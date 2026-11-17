import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getCurrentTheme, listPastThemes, toThemeDTO } from "@/server/services/themes";

/** これまでのお題（新しい順） */
export const GET = route(async (req: NextRequest) => {
  await requireViewer(req);
  const at = await now();
  await getCurrentTheme(at); // 今日のお題が未確定ならここで確定させる
  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : undefined;
  const rows = await listPastThemes(at, {
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit: 30,
  });
  const items = rows.map((t) => toThemeDTO(t, at));
  return json({ items, nextCursor: rows.length === 30 ? rows[rows.length - 1].startsAt.toISOString() : null });
});
