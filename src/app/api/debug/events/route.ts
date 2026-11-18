import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { buildPreset, createEvent, endActiveEvents, notifyEventStart, toEventDTO } from "@/server/services/events";
import { PRESET_KEYS, PRESETS, type PixelArt } from "@/lib/pixel-art";

const HOUR = 3600_000;

const schema = z.object({
  preset: z.enum(PRESET_KEYS as [string, ...string[]]).optional(),
  /** プリセットの代わりに色を直接指定する（市松模様の絵になる） */
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), name: z.string().min(1).max(20) })).min(1).max(8).optional(),
  size: z.number().int().min(2).max(48).default(8),
  hours: z.number().min(0.1).max(24 * 14).default(72),
  threshold: z.number().min(0.01).max(1).default(0.25),
  title: z.string().max(40).optional(),
});

/** デバッグ: 任意の内容でイベントを今すぐ開催する（開催中のイベントは終了させる） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  const input = schema.parse(await readJson(req));
  const at = await now();
  let art: PixelArt;
  let title = input.title;
  if (input.palette) {
    const k = input.palette.length;
    art = {
      w: input.size,
      h: input.size,
      palette: input.palette,
      cells: Array.from({ length: input.size * input.size }, (_, i) => (Math.floor(i / input.size) + (i % input.size)) % k),
    };
    title ??= "デバッグの絵";
  } else {
    const key = input.preset ?? PRESET_KEYS[0];
    art = buildPreset(key, input.size, input.size);
    title ??= PRESETS[key].name;
  }
  await endActiveEvents(at);
  const ev = await createEvent({
    title,
    description: "デバッグモードで開始したイベントです。",
    art,
    threshold: input.threshold,
    startsAt: at,
    endsAt: new Date(at.getTime() + input.hours * HOUR),
    source: "debug",
    presetKey: input.preset ?? null,
    createdById: viewer.id,
  });
  await notifyEventStart(ev);
  return json({ event: await toEventDTO(ev, at) }, { status: 201 });
});

/** デバッグ: 開催中のイベントを今すぐ終了する */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  await endActiveEvents(await now());
  return json({ ok: true });
});
