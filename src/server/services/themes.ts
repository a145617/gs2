import { and, asc, desc, eq, gt, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { themePool, themes, type ThemeRow } from "../db/schema";
import { DEFAULT_THEME_POOL } from "../seed/theme-pool";
import { badRequest, notFound } from "../http/respond";
import { nextThemeChange, themeDayKey, themeDayStart } from "@/lib/time";
import { TEMPLATES, type TemplateKey } from "@/lib/templates";
import type { ThemeDTO } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

export function toThemeDTO(t: ThemeRow, at: Date): ThemeDTO {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    template: t.template,
    templateName: TEMPLATES[t.template].name,
    accent: t.accent,
    startsAt: t.startsAt.toISOString(),
    endsAt: t.endsAt.toISOString(),
    dayKey: t.dayKey ?? themeDayKey(t.startsAt),
    source: t.source,
    isCurrent: t.startsAt <= at && t.endsAt > at,
  };
}

/** お題候補が空なら初期データを入れる */
export async function seedThemePool(): Promise<number> {
  const rows = await db
    .insert(themePool)
    .values(DEFAULT_THEME_POOL)
    .onConflictDoNothing({ target: themePool.title })
    .returning({ id: themePool.id });
  return rows.length;
}

/** 候補から次のお題を選ぶ（使われた回数が少ないものを優先し、前日と同じ表示テンプレートは避ける） */
async function pickFromPool(avoidTemplate?: TemplateKey) {
  let candidates = await db
    .select()
    .from(themePool)
    .where(eq(themePool.enabled, true))
    .orderBy(asc(themePool.timesUsed), sql`random()`)
    .limit(12);
  if (candidates.length === 0) {
    await seedThemePool();
    candidates = await db
      .select()
      .from(themePool)
      .where(eq(themePool.enabled, true))
      .orderBy(asc(themePool.timesUsed), sql`random()`)
      .limit(12);
  }
  const preferred = candidates.filter((c) => c.template !== avoidTemplate);
  const list = preferred.length > 0 ? preferred : candidates;
  return list[Math.floor(Math.random() * Math.min(list.length, 6))] ?? null;
}

async function findActiveAt(at: Date): Promise<ThemeRow | null> {
  const rows = await db
    .select()
    .from(themes)
    .where(and(lte(themes.startsAt, at), gt(themes.endsAt, at)))
    .orderBy(desc(themes.startsAt), desc(themes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** その日の自動出題のお題を（無ければ）作る。朝5時以降の最初のアクセスで確定する */
async function ensureDailyTheme(at: Date): Promise<void> {
  const dayKey = themeDayKey(at);
  const exists = await db.query.themes.findFirst({ where: eq(themes.dayKey, dayKey), columns: { id: true } });
  if (exists) return;
  const prev = await db
    .select({ template: themes.template })
    .from(themes)
    .where(lt(themes.startsAt, themeDayStart(dayKey)))
    .orderBy(desc(themes.startsAt))
    .limit(1);
  const pick = await pickFromPool(prev[0]?.template);
  const startsAt = themeDayStart(dayKey);
  const fallback = DEFAULT_THEME_POOL[0];
  const inserted = await db
    .insert(themes)
    .values({
      title: pick?.title ?? fallback.title,
      description: pick?.description ?? fallback.description,
      template: pick?.template ?? fallback.template,
      accent: pick?.accent ?? fallback.accent,
      startsAt,
      endsAt: new Date(startsAt.getTime() + DAY),
      dayKey,
      source: "auto",
      poolId: pick?.id ?? null,
    })
    .onConflictDoNothing({ target: themes.dayKey })
    .returning({ id: themes.id });
  if (inserted.length > 0 && pick) {
    await db
      .update(themePool)
      .set({ timesUsed: sql`${themePool.timesUsed} + 1`, lastUsedAt: at })
      .where(eq(themePool.id, pick.id));
  }
}

/**
 * 時刻 at の時点のお題。
 * 管理者・デバッグで開始したお題があればそれを優先し、無ければその日の自動出題のお題を返す。
 */
export async function getCurrentTheme(at: Date): Promise<ThemeRow> {
  const active = await findActiveAt(at);
  if (active) return active;
  await ensureDailyTheme(at);
  const after = await findActiveAt(at);
  if (after) return after;
  // 自動出題のお題が早めに終了させられていた場合などは、次の朝5時までの臨時のお題を作る
  const pick = await pickFromPool();
  const fallback = DEFAULT_THEME_POOL[0];
  const [row] = await db
    .insert(themes)
    .values({
      title: pick?.title ?? fallback.title,
      description: pick?.description ?? fallback.description,
      template: pick?.template ?? fallback.template,
      accent: pick?.accent ?? fallback.accent,
      startsAt: at,
      endsAt: nextThemeChange(at),
      source: "auto",
      poolId: pick?.id ?? null,
    })
    .returning();
  return row;
}

/** 次にお題が切り替わる時刻 */
export async function getNextChangeAt(current: ThemeRow, at: Date): Promise<Date> {
  const upcoming = await db
    .select({ startsAt: themes.startsAt })
    .from(themes)
    .where(and(gt(themes.startsAt, at), lt(themes.startsAt, current.endsAt)))
    .orderBy(asc(themes.startsAt))
    .limit(1);
  const candidates = [current.endsAt, nextThemeChange(at)];
  if (upcoming[0]) candidates.push(upcoming[0].startsAt);
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

export type ThemeInput = {
  title: string;
  description?: string;
  template: TemplateKey;
  accent?: string;
};

/** 管理者・デバッグ: 任意のお題を今すぐ開始する（既定では次の朝5時まで） */
export async function startThemeNow(
  input: ThemeInput & { endsAt?: Date; source: "admin" | "debug"; createdById?: string | null },
  at: Date,
): Promise<ThemeRow> {
  const endsAt = input.endsAt ?? nextThemeChange(at);
  if (endsAt <= at) throw badRequest("終了時刻は現在より後にしてください");
  const [row] = await db
    .insert(themes)
    .values({
      title: input.title,
      description: input.description ?? "",
      template: input.template,
      accent: input.accent ?? TEMPLATES[input.template].accent,
      startsAt: at,
      endsAt,
      source: input.source,
      createdById: input.createdById ?? null,
    })
    .returning();
  return row;
}

/** 管理者: 開始・終了時刻を指定してお題を予約する */
export async function scheduleTheme(
  input: ThemeInput & { startsAt: Date; endsAt: Date; source: "admin" | "debug"; createdById?: string | null },
): Promise<ThemeRow> {
  if (input.endsAt <= input.startsAt) throw badRequest("終了時刻は開始時刻より後にしてください");
  const [row] = await db
    .insert(themes)
    .values({
      title: input.title,
      description: input.description ?? "",
      template: input.template,
      accent: input.accent ?? TEMPLATES[input.template].accent,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      source: input.source,
      createdById: input.createdById ?? null,
    })
    .returning();
  return row;
}

export async function getThemeById(id: string): Promise<ThemeRow> {
  const row = await db.query.themes.findFirst({ where: eq(themes.id, id) });
  if (!row) throw notFound("お題が見つかりませんでした");
  return row;
}

export async function updateTheme(id: string, patch: Partial<ThemeInput> & { startsAt?: Date; endsAt?: Date }) {
  const values: Partial<ThemeRow> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.template !== undefined) values.template = patch.template;
  if (patch.accent !== undefined) values.accent = patch.accent;
  if (patch.startsAt !== undefined) values.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) values.endsAt = patch.endsAt;
  const [row] = await db.update(themes).set(values).where(eq(themes.id, id)).returning();
  if (!row) throw notFound("お題が見つかりませんでした");
  if (row.endsAt <= row.startsAt) throw badRequest("終了時刻は開始時刻より後にしてください");
  return row;
}

/** 管理者: お題を今すぐ終了する */
export async function endThemeNow(id: string, at: Date) {
  const [row] = await db
    .update(themes)
    .set({ endsAt: at })
    .where(and(eq(themes.id, id), gt(themes.endsAt, at)))
    .returning();
  return row ?? null;
}

/** これまでのお題（開始済みのもの、新しい順） */
export async function listPastThemes(at: Date, opts: { before?: Date; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 30, 100);
  const conds = [lte(themes.startsAt, at)];
  if (opts.before) conds.push(lt(themes.startsAt, opts.before));
  return db
    .select()
    .from(themes)
    .where(and(...conds))
    .orderBy(desc(themes.startsAt))
    .limit(limit);
}

/** 管理者: 予約中（まだ始まっていない）のお題 */
export async function listUpcomingThemes(at: Date) {
  return db.select().from(themes).where(gt(themes.startsAt, at)).orderBy(asc(themes.startsAt)).limit(50);
}

export async function deleteUpcomingTheme(id: string, at: Date) {
  const rows = await db
    .delete(themes)
    .where(and(eq(themes.id, id), gt(themes.startsAt, at)))
    .returning({ id: themes.id });
  if (rows.length === 0) throw badRequest("開始前のお題のみ削除できます");
}

// ------------------------------------------------------------- お題の候補
export async function listPool() {
  return db.select().from(themePool).orderBy(asc(themePool.template), asc(themePool.title));
}

export async function addPoolEntry(input: ThemeInput) {
  const [row] = await db
    .insert(themePool)
    .values({
      title: input.title,
      description: input.description ?? "",
      template: input.template,
      accent: input.accent ?? TEMPLATES[input.template].accent,
    })
    .onConflictDoNothing({ target: themePool.title })
    .returning();
  if (!row) throw badRequest("同じお題がすでに候補にあります");
  return row;
}

export async function setPoolEnabled(id: string, enabled: boolean) {
  await db.update(themePool).set({ enabled, updatedAt: new Date() }).where(eq(themePool.id, id));
}

export async function countThemes() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(themes).where(ne(themes.title, ""));
  return row?.n ?? 0;
}
