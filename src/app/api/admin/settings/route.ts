import type { NextRequest } from "next/server";
import { z } from "zod";
import { route, json, readJson } from "@/server/http/respond";
import { assertSameOrigin } from "@/server/http/csrf";
import { requireAdmin } from "@/server/http/viewer";
import { getSetting, setSetting, SETTING_KEYS } from "@/server/settings";
import { audit } from "@/server/services/admin";
import { getAutoSchedule, setAutoSchedule } from "@/server/services/events";
import { DEFAULT_AUTO_HIDE } from "@/server/services/moderation";
import { isoDateSchema } from "@/lib/validation";

async function readSettings() {
  const [dailyPostLimit, autoHideReports, eventAuto] = await Promise.all([
    getSetting<number | null>(SETTING_KEYS.dailyPostLimit, null),
    getSetting<number>(SETTING_KEYS.autoHideReports, DEFAULT_AUTO_HIDE),
    getAutoSchedule(),
  ]);
  return { dailyPostLimit, autoHideReports, eventAuto };
}

/** アプリ全体の設定 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req);
  return json(await readSettings());
});

const schema = z.object({
  /** 1日（お題1つ）あたりの投稿数の上限。null で無制限 */
  dailyPostLimit: z.number().int().min(1, "上限は1〜100にしてください").max(100, "上限は1〜100にしてください").nullable().optional(),
  /** 何件の通報で自動的に非表示にするか（0 で自動非表示しない） */
  autoHideReports: z.number().int().min(0, "0〜100にしてください").max(100, "0〜100にしてください").optional(),
  /** イベントの自動開催（1週間に1度程度、不定期） */
  eventAutoEnabled: z.boolean().optional(),
  /** 次の自動開催の日時（null で自動的に決め直す） */
  eventNextAutoAt: isoDateSchema.nullable().optional(),
});

export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const input = schema.parse(await readJson(req));
  if (input.dailyPostLimit !== undefined) await setSetting(SETTING_KEYS.dailyPostLimit, input.dailyPostLimit);
  if (input.autoHideReports !== undefined) await setSetting(SETTING_KEYS.autoHideReports, input.autoHideReports);
  if (input.eventAutoEnabled !== undefined || input.eventNextAutoAt !== undefined) {
    await setAutoSchedule({ enabled: input.eventAutoEnabled, nextAutoAt: input.eventNextAutoAt });
  }
  await audit(admin.id, "settings.update", "settings", null, {
    ...input,
    eventNextAutoAt: input.eventNextAutoAt === undefined ? undefined : (input.eventNextAutoAt?.toISOString() ?? null),
  });
  return json(await readSettings());
});
