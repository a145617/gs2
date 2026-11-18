import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { readImageFile } from "@/server/images";
import { audit } from "@/server/services/admin";
import {
  artFromImage,
  buildPreset,
  createEvent,
  DEFAULT_EVENT_HOURS,
  endActiveEvents,
  getAutoSchedule,
  listAllEvents,
  notifyEventStart,
  toEventDTO,
} from "@/server/services/events";
import { cleanText, isoDateSchema } from "@/lib/validation";
import { PRESET_KEYS, PRESETS, type PixelArt } from "@/lib/pixel-art";

const HOUR = 3600_000;

/** イベントの一覧（予約・開催中・終了）と自動開催の予定 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const at = await now();
  const [items, auto] = await Promise.all([listAllEvents(at), getAutoSchedule()]);
  return json({
    items,
    auto,
    presets: PRESET_KEYS.map((key) => ({ key, name: PRESETS[key].name, description: PRESETS[key].description })),
    serverNow: at.toISOString(),
  });
});

const schema = z.object({
  title: z
    .string("タイトルを入力してください")
    .transform(cleanText)
    .pipe(z.string().min(1, "タイトルを入力してください").max(40, "タイトルは40文字以内にしてください")),
  description: z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(300, "説明は300文字以内にしてください"))
    .default(""),
  /** 絵の作り方: 用意された絵（preset）か、アップロードした画像（image） */
  source: z.enum(["preset", "image"]).default("preset"),
  preset: z.enum(PRESET_KEYS as [string, ...string[]], "絵の種類を選んでください").optional(),
  size: z.coerce.number().int().min(4, "マス目は4〜48にしてください").max(48, "マス目は4〜48にしてください").default(12),
  colors: z.coerce.number().int().min(2, "色の数は2〜12にしてください").max(12, "色の数は2〜12にしてください").default(6),
  threshold: z.coerce.number().min(0.05, "合格ラインは5〜90%にしてください").max(0.9, "合格ラインは5〜90%にしてください").default(0.25),
  /** 省略すると今すぐ開始 */
  startsAt: isoDateSchema.optional(),
  hours: z.coerce.number().min(1, "期間は1時間以上にしてください").max(24 * 30, "期間は30日以内にしてください").default(DEFAULT_EVENT_HOURS),
  /** true なら作らずに絵だけ返す（画像から作る絵の確認用） */
  preview: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((v) => v === true || v === "true" || v === "1")
    .default(false),
});

async function readInput(req: NextRequest): Promise<{ raw: Record<string, unknown>; image: Buffer | null }> {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const body = await readJson(req);
    if (!body || typeof body !== "object") throw badRequest();
    return { raw: body as Record<string, unknown>, image: null };
  }
  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && v !== "") raw[k] = v;
  const image = raw.source === "image" ? await readImageFile(form, "image", 15 * 1024 * 1024) : null;
  return { raw, image };
}

/** 任意の内容・タイミングでイベントを開催する（今すぐ、または日時を指定して予約） */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const at = await now();
  const { raw, image } = await readInput(req);
  const input = schema.parse(raw);

  let art: PixelArt;
  let presetKey: string | null = null;
  if (input.source === "image") {
    if (!image) throw badRequest("絵の元にする画像を選んでください");
    art = await artFromImage(image, input.size, input.size, input.colors);
  } else {
    presetKey = input.preset ?? PRESET_KEYS[Math.floor(Math.random() * PRESET_KEYS.length)];
    art = buildPreset(presetKey, input.size, input.size);
  }
  if (input.preview) return json({ art });

  if (input.startsAt && input.startsAt <= at) {
    throw badRequest("開始日時は現在より後にしてください（すぐに始める場合は「今すぐ開始」を選んでください）");
  }
  const startsAt = input.startsAt ?? at;
  const startNow = !input.startsAt;
  // 今すぐ始めるときは、開催中のイベントを終了させる（同時に2つ開催しない）
  const ended = startNow ? await endActiveEvents(at) : 0;
  const ev = await createEvent({
    title: input.title,
    description: input.description,
    art,
    threshold: input.threshold,
    startsAt,
    endsAt: new Date(startsAt.getTime() + input.hours * HOUR),
    source: "admin",
    presetKey,
    createdById: admin.id,
  });
  // 予約したイベントは、開始後の最初のアクセスでお知らせを送る
  if (startNow) await notifyEventStart(ev);
  await audit(admin.id, startNow ? "event.start" : "event.schedule", "event", ev.id, {
    title: ev.title,
    source: input.source,
    presetKey,
    size: input.size,
    startsAt: ev.startsAt.toISOString(),
    endsAt: ev.endsAt.toISOString(),
    endedOthers: ended,
  });
  return json({ event: await toEventDTO(ev, at) }, { status: 201 });
});
