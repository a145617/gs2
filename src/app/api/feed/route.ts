import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireViewer } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { env } from "@/server/env";
import { getFeedPage } from "@/server/services/feed";

/**
 * ホームのフィード。
 * seed: 並び順の種（同じ種なら同じ順番。ページ送りで重複しない）、cursor: 何件目から
 * debug=1: デバッグモードのとき、並び順の内訳（人気・好み・ランダム）を付ける
 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireViewer(req);
  const sp = req.nextUrl.searchParams;
  const seed = (sp.get("seed") ?? "default").slice(0, 32);
  const offset = Math.max(0, Math.min(5000, Number.parseInt(sp.get("cursor") ?? "0", 10) || 0));
  const withDebug = env.debugMode && sp.get("debug") === "1";
  return json(await getFeedPage(viewer, await now(), { seed, offset, withDebug }));
});
