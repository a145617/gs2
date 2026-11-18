import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireDebug } from "@/server/http/debug";
import { runSelfTests } from "@/server/services/selftest";

/** デバッグ: サーバー側の自己診断（この環境で各機能が動くか） */
export const GET = route(async (req: NextRequest) => {
  await requireDebug(req);
  const results = await runSelfTests();
  return json({ results, ok: results.every((r) => r.ok), ranAt: new Date().toISOString() });
});
