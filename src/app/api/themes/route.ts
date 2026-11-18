import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getCurrentTheme, listPastThemes, toThemeDTO } from "@/server/services/themes";

/** これまでのお題（新しい順） */
export const GET = route(async (req: NextRequest) => {
  await requireViewer(req);
  const at = await now();
  const current = await getCurrentTheme(at); // 今日のお題が未確定ならここで確定させる
  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam ? new Date(beforeParam) : undefined;
  const validBefore = before && !Number.isNaN(before.getTime()) ? before : undefined;
  const rows = await listPastThemes(at, { before: validBefore, limit: 30 });
  const items = rows.map((t) => toThemeDTO(t, at));
  // 開催中のお題を一番上に出す（あとから始まって早めに終わったお題があっても、今のお題が先頭）
  if (!validBefore) {
    const i = items.findIndex((t) => t.id === current.id);
    if (i > 0) items.unshift(...items.splice(i, 1));
  }
  return json({ items, nextCursor: rows.length === 30 ? rows[rows.length - 1].startsAt.toISOString() : null });
});
