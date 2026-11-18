import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { getDebugStatus } from "@/server/services/debug";

/** デバッグ: 仮想時計・お題・イベント・テスト用ユーザーの状態 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireDebug(req);
  return json(await getDebugStatus({ id: viewer.id, impersonatorId: viewer.session.impersonatorId }, await now()));
});
