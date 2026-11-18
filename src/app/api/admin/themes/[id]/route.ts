import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest, notFound } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { audit } from "@/server/services/admin";
import { deleteUpcomingTheme, endThemeNow, toThemeDTO, updateTheme } from "@/server/services/themes";
import { hexColorSchema, isoDateSchema, templateKeySchema, themeDescriptionSchema, themeTitleSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/themes/[id]">;

async function themeId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("お題が見つかりませんでした");
  return id;
}

const patchSchema = z.object({
  title: themeTitleSchema.optional(),
  description: themeDescriptionSchema.optional(),
  template: templateKeySchema.optional(),
  accent: hexColorSchema.optional(),
  startsAt: isoDateSchema.optional(),
  endsAt: isoDateSchema.optional(),
});

/** お題の内容・期間を変更する */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const id = await themeId(ctx);
  const patch = patchSchema.parse(await readJson(req));
  const row = await updateTheme(id, patch);
  await audit(admin.id, "theme.edit", "theme", id, {
    ...patch,
    startsAt: patch.startsAt?.toISOString(),
    endsAt: patch.endsAt?.toISOString(),
  });
  return json({ theme: toThemeDTO(row, await now()) });
});

/** 開催中のお題を今すぐ終了する */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const id = await themeId(ctx);
  z.object({ action: z.literal("end") }).parse(await readJson(req));
  const row = await endThemeNow(id, await now());
  if (!row) throw badRequest("開催中のお題ではありません");
  await audit(admin.id, "theme.end", "theme", id, { title: row.title });
  return json({ ok: true });
});

/** 開始前のお題を取り消す */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const id = await themeId(ctx);
  await deleteUpcomingTheme(id, await now());
  await audit(admin.id, "theme.delete", "theme", id);
  return json({ ok: true });
});
