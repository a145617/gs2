import type { NextRequest } from "next/server";
import { route, json } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { toEventDTO } from "@/server/services/events";
import { triggerAutoEvent } from "@/server/services/debug";

/** デバッグ: 「不定期の自動開催」を今すぐ発生させる */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  const at = await now();
  const ev = await triggerAutoEvent(at);
  return json({ event: await toEventDTO(ev, at) }, { status: 201 });
});
