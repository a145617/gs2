import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { audit } from "@/server/services/admin";
import { deleteUpcomingEvent, endEventNow, toEventDTO, updateEvent } from "@/server/services/events";
import { cleanText, isoDateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/events/[id]">;

const patchSchema = z.object({
  title: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, "タイトルを入力してください").max(40, "タイトルは40文字以内にしてください"))
    .optional(),
  description: z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(300, "説明は300文字以内にしてください"))
    .optional(),
  endsAt: isoDateSchema.optional(),
});

/** イベントの名前・説明・終了日時を変更する（期間の延長など） */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = patchSchema.parse(await readJson(req));
  const row = await updateEvent(id, patch);
  await audit(admin.id, "event.edit", "event", id, { ...patch, endsAt: patch.endsAt?.toISOString() });
  return json({ event: await toEventDTO(row, await now()) });
});

/** 開催中のイベントを今すぐ終了する */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  z.object({ action: z.literal("end") }).parse(await readJson(req));
  const row = await endEventNow(id, await now());
  await audit(admin.id, "event.end", "event", id, { title: row.title });
  return json({ ok: true });
});

/** 開始前のイベントを取り消す */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  await deleteUpcomingEvent(id, await now());
  await audit(admin.id, "event.delete", "event", id);
  return json({ ok: true });
});
