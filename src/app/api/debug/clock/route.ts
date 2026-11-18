import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { shiftClock } from "@/server/services/debug";
import { isoDateSchema } from "@/lib/validation";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), ms: z.number().int().min(-400 * 86400_000).max(400 * 86400_000) }),
  z.object({ type: z.literal("set"), at: isoDateSchema }),
  z.object({ type: z.literal("reset") }),
  z.object({ type: z.literal("beforeRollover"), seconds: z.number().int().min(0).max(3600).default(30) }),
]);

/** デバッグ: 仮想時計を動かす（朝5時のお題の切り替えやイベントの期間を待たずに確認する） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  const r = await shiftClock(schema.parse(await readJson(req)));
  return json({ offsetMs: r.offsetMs, now: r.now.toISOString() });
});
