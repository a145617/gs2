import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson, badRequest } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { now } from "@/server/clock";
import { audit } from "@/server/services/admin";
import {
  getCurrentTheme,
  listPastThemes,
  listUpcomingThemes,
  scheduleTheme,
  startThemeNow,
  toThemeDTO,
} from "@/server/services/themes";
import { isoDateSchema, themeInputSchema } from "@/lib/validation";
import { nextThemeChange } from "@/lib/time";

/** 現在・予約中・これまでのお題 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  const at = await now();
  const current = await getCurrentTheme(at);
  const [upcoming, past] = await Promise.all([listUpcomingThemes(at), listPastThemes(at, { limit: 30 })]);
  return json({
    current: toThemeDTO(current, at),
    upcoming: upcoming.map((t) => toThemeDTO(t, at)),
    past: past.map((t) => toThemeDTO(t, at)),
    serverNow: at.toISOString(),
  });
});

const schema = z.discriminatedUnion("mode", [
  /** 今すぐ開始（終了時刻を省略すると次の朝5時まで） */
  themeInputSchema.extend({ mode: z.literal("now"), endsAt: isoDateSchema.optional() }),
  /** 開始・終了時刻を指定して予約（終了時刻を省略すると開始後最初の朝5時まで） */
  themeInputSchema.extend({ mode: z.literal("schedule"), startsAt: isoDateSchema, endsAt: isoDateSchema.optional() }),
]);

/** 任意のタイミング・内容でお題を出す */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const input = schema.parse(await readJson(req));
  const at = await now();
  const content = { title: input.title, description: input.description, template: input.template, accent: input.accent };
  let row;
  if (input.mode === "now") {
    row = await startThemeNow({ ...content, endsAt: input.endsAt, source: "admin", createdById: admin.id }, at);
  } else {
    if (input.startsAt <= at) throw badRequest("開始時刻は現在より後にしてください（すぐに始める場合は「今すぐ開始」を選んでください）");
    row = await scheduleTheme({
      ...content,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? nextThemeChange(input.startsAt),
      source: "admin",
      createdById: admin.id,
    });
  }
  await audit(admin.id, input.mode === "now" ? "theme.start" : "theme.schedule", "theme", row.id, {
    title: row.title,
    template: row.template,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  });
  return json({ theme: toThemeDTO(row, at) }, { status: 201 });
});
