import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { fillEventCells } from "@/server/services/debug";

const schema = z.object({
  eventId: z.uuid().optional(),
  /** 埋めるマスの数（"all" で全部） */
  count: z.union([z.number().int().min(1).max(600), z.literal("all")]).default(10),
});

/** デバッグ: 開催中のイベントのマスを、テスト用ユーザーの写真で埋める（全部埋めると完成する） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  const { eventId, count } = schema.parse(await readJson(req));
  return json(await fillEventCells(eventId ?? null, count, await now()));
});
