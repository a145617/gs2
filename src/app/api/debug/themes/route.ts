import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireDebug } from "@/server/http/debug";
import { now } from "@/server/clock";
import { endCurrentTheme, startDebugTheme } from "@/server/services/debug";
import { toThemeDTO } from "@/server/services/themes";
import { isoDateSchema, templateKeySchema, themeDescriptionSchema, themeTitleSchema } from "@/lib/validation";

const schema = z.object({
  /** 省略すると、お題の候補からランダムに選ぶ */
  title: themeTitleSchema.optional(),
  description: themeDescriptionSchema.optional(),
  template: templateKeySchema.optional(),
  endsAt: isoDateSchema.optional(),
});

/** デバッグ: 任意の内容（またはランダム）のお題を今すぐ始める */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const viewer = await requireDebug(req);
  const input = schema.parse(await readJson(req));
  const at = await now();
  const theme = await startDebugTheme(viewer, input, at);
  return json({ theme: toThemeDTO(theme, at) }, { status: 201 });
});

/** デバッグ: 今のお題を今すぐ終わらせる */
export const DELETE = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  await requireDebug(req);
  const at = await now();
  const next = await endCurrentTheme(at);
  return json({ theme: toThemeDTO(next, at) });
});
