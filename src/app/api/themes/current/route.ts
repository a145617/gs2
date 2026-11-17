import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { getCurrentTheme, getNextChangeAt, toThemeDTO } from "@/server/services/themes";
import type { CurrentThemeResponse } from "@/lib/types";

/** 今のお題（朝5時を過ぎて最初のアクセスで、その日のお題が確定する） */
export const GET = route(async (req: NextRequest) => {
  await requireViewer(req);
  const at = await now();
  const theme = await getCurrentTheme(at);
  const nextChangeAt = await getNextChangeAt(theme, at);
  const body: CurrentThemeResponse = {
    theme: toThemeDTO(theme, at),
    nextChangeAt: nextChangeAt.toISOString(),
    serverNow: at.toISOString(),
  };
  return json(body);
});
