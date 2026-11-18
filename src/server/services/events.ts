import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/client";
import { eventCells, eventParticipants, events, notifications, posts, users, type EventRow } from "../db/schema";
import { badRequest, conflict, notFound } from "../http/respond";
import { processPostImage } from "../images";
import { getSetting, setSetting } from "../settings";
import { insertPost, deletePostImages, hydratePosts, type CreatePostInput, type ViewerCtx } from "./posts";
import { colorCoverage } from "@/lib/color";
import { pixelize, PRESETS, PRESET_KEYS, type PixelArt } from "@/lib/pixel-art";
import type { CurrentEventResponse, EventCellDTO, EventColor, EventDTO, EventDetailResponse, EventPostResult, MyEventColor } from "@/lib/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const DEFAULT_EVENT_HOURS = 72;
const NEXT_AUTO_KEY = "events.nextAutoAt";
const AUTO_ENABLED_KEY = "events.autoEnabled";

// ------------------------------------------------------------------ 状態・表示用データ
export function eventStatus(e: Pick<EventRow, "startsAt" | "endsAt" | "completedAt">, at: Date): EventDTO["status"] {
  if (e.startsAt > at) return "upcoming";
  if (e.endsAt <= at) return "ended";
  if (e.completedAt) return "completed";
  return "active";
}

async function colorStats(eventId: string) {
  const rows = await db
    .select({
      colorIndex: eventCells.colorIndex,
      total: sql<number>`count(*)::int`,
      filled: sql<number>`count(${eventCells.postId})::int`,
    })
    .from(eventCells)
    .where(eq(eventCells.eventId, eventId))
    .groupBy(eventCells.colorIndex);
  return new Map(rows.map((r) => [r.colorIndex, r]));
}

export async function toEventDTO(e: EventRow, at: Date): Promise<EventDTO> {
  const [stats, [p]] = await Promise.all([
    colorStats(e.id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventParticipants)
      .where(eq(eventParticipants.eventId, e.id)),
  ]);
  const palette: EventColor[] = e.palette.map((c, index) => ({
    index,
    hex: c.hex,
    name: c.name,
    total: stats.get(index)?.total ?? 0,
    filled: stats.get(index)?.filled ?? 0,
  }));
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    gridW: e.gridW,
    gridH: e.gridH,
    palette,
    threshold: e.threshold,
    deltaE: e.deltaE,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    status: eventStatus(e, at),
    totalCells: palette.reduce((a, c) => a + c.total, 0),
    filledCells: palette.reduce((a, c) => a + c.filled, 0),
    participants: p?.n ?? 0,
    source: e.source,
  };
}

// ------------------------------------------------------------------ 作成
export type EventInput = {
  title: string;
  description?: string;
  art: PixelArt;
  threshold?: number;
  deltaE?: number;
  startsAt: Date;
  endsAt: Date;
  source: "auto" | "admin" | "debug";
  presetKey?: string | null;
  createdById?: string | null;
};

export async function createEvent(input: EventInput): Promise<EventRow> {
  const { art } = input;
  if (art.w < 2 || art.h < 2 || art.w > 64 || art.h > 64) throw badRequest("マス目は 2〜64 の範囲で指定してください");
  if (art.cells.length !== art.w * art.h) throw badRequest("絵のデータが正しくありません");
  if (input.endsAt <= input.startsAt) throw badRequest("終了時刻は開始時刻より後にしてください");
  return db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(events)
      .values({
        title: input.title,
        description: input.description ?? "",
        gridW: art.w,
        gridH: art.h,
        palette: art.palette,
        cells: art.cells,
        threshold: input.threshold ?? 0.25,
        deltaE: input.deltaE ?? 22,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        source: input.source,
        presetKey: input.presetKey ?? null,
        createdById: input.createdById ?? null,
      })
      .returning();
    const rows = art.cells.map((colorIndex, cellIndex) => ({ eventId: ev.id, cellIndex, colorIndex }));
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(eventCells).values(rows.slice(i, i + 1000));
    return ev;
  });
}

export function buildPreset(presetKey: string, w: number, h: number): PixelArt {
  const preset = PRESETS[presetKey];
  if (!preset) throw badRequest("絵のプリセットが見つかりません");
  return preset.build(w, h);
}

/** 管理者がアップロードした画像から、ピクセルアートを作る */
export async function artFromImage(image: Buffer, w: number, h: number, colors: number): Promise<PixelArt> {
  try {
    const { data } = await sharp(image, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize(w, h, { fit: "cover", position: "attention" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return pixelize(data, w, h, Math.max(2, Math.min(12, colors)));
  } catch {
    throw badRequest("画像を読み込めませんでした");
  }
}

/** 指定したユーザーたちにイベントのお知らせを送る */
async function notifyUsers(userIds: string[], data: Record<string, unknown>, at: Date) {
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500);
    if (chunk.length === 0) continue;
    await db.insert(notifications).values(chunk.map((userId) => ({ userId, type: "event" as const, data, createdAt: at })));
  }
}

/** イベント開始のお知らせを全員に送る（1つのイベントにつき1回だけ） */
export async function notifyEventStart(ev: EventRow) {
  const marked = await db
    .update(events)
    .set({ notifiedAt: new Date() })
    .where(and(eq(events.id, ev.id), isNull(events.notifiedAt)))
    .returning({ id: events.id });
  if (marked.length === 0) return;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
  await notifyUsers(
    rows.map((r) => r.id),
    { title: ev.title, eventId: ev.id, message: `イベント「${ev.title}」が始まりました。あなたの色で1ピクセルを撮りに行こう` },
    ev.startsAt,
  );
}

// ------------------------------------------------------------------ 自動開催（1週間に1度程度、不定期）
function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** 次の自動開催の日時（JST 9〜20時のどこか） */
function pickNextAuto(from: Date, minDays: number, maxDays: number): Date {
  const t = new Date(from.getTime() + randomBetween(minDays, maxDays) * DAY);
  const jst = new Date(t.getTime() + 9 * HOUR);
  jst.setUTCHours(Math.floor(randomBetween(9, 21)), Math.floor(randomBetween(0, 60)), 0, 0);
  return new Date(jst.getTime() - 9 * HOUR);
}

async function activeUserCount(at: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${posts.userId})::int` })
    .from(posts)
    .where(gte(posts.createdAt, new Date(at.getTime() - 14 * DAY)));
  return row?.n ?? 0;
}

/** 参加しそうな人数に合わせたマス目の大きさ（8〜24） */
export async function suggestedGridSize(at: Date): Promise<number> {
  const n = await activeUserCount(at);
  const target = Math.max(64, Math.min(576, n * 6));
  return Math.max(8, Math.min(24, Math.round(Math.sqrt(target))));
}

export async function startAutoEvent(at: Date): Promise<EventRow> {
  const presetKey = PRESET_KEYS[Math.floor(Math.random() * PRESET_KEYS.length)];
  const size = await suggestedGridSize(at);
  const preset = PRESETS[presetKey];
  const ev = await createEvent({
    title: preset.name,
    description: `${preset.description}。指定された色が多く写った写真で、みんなで1枚の絵を完成させよう。`,
    art: preset.build(size, size),
    startsAt: at,
    endsAt: new Date(at.getTime() + DEFAULT_EVENT_HOURS * HOUR),
    source: "auto",
    presetKey,
  });
  await notifyEventStart(ev);
  return ev;
}

/**
 * 自動開催の確認（アクセスのたびに呼ぶ。cron 不要）。
 * 予定日時を過ぎていて開催中のイベントが無ければ、新しいイベントを始める。
 */
export async function ensureAutoEvent(at: Date): Promise<void> {
  const enabled = await getSetting<boolean>(AUTO_ENABLED_KEY, true);
  if (!enabled) return;
  const raw = await getSetting<string | null>(NEXT_AUTO_KEY, null);
  if (!raw) {
    await setSetting(NEXT_AUTO_KEY, pickNextAuto(at, 1, 7).toISOString());
    return;
  }
  const next = new Date(raw);
  if (at < next) return;
  // 同時アクセスで二重に始めないよう、予定日時を先に更新できた1回だけが開始する
  const nextNext = pickNextAuto(at, 5, 9).toISOString();
  const updated = await db.execute(sql`
    UPDATE app_settings SET value = to_jsonb(${nextNext}::text), updated_at = now()
    WHERE key = ${NEXT_AUTO_KEY} AND value = to_jsonb(${raw}::text)
    RETURNING key
  `);
  if (updated.length === 0) return;
  const active = await findCurrentEvent(at);
  if (!active) await startAutoEvent(at);
}

export async function getAutoSchedule() {
  const [enabled, next] = await Promise.all([
    getSetting<boolean>(AUTO_ENABLED_KEY, true),
    getSetting<string | null>(NEXT_AUTO_KEY, null),
  ]);
  return { enabled, nextAutoAt: next };
}

export async function setAutoSchedule(patch: { enabled?: boolean; nextAutoAt?: Date | null }) {
  if (patch.enabled !== undefined) await setSetting(AUTO_ENABLED_KEY, patch.enabled);
  if (patch.nextAutoAt !== undefined) await setSetting(NEXT_AUTO_KEY, patch.nextAutoAt ? patch.nextAutoAt.toISOString() : null);
}

// ------------------------------------------------------------------ 取得
/** 開催中（完成済みで期間内のものを含む）のイベント */
export async function findCurrentEvent(at: Date): Promise<EventRow | null> {
  const rows = await db
    .select()
    .from(events)
    .where(and(lte(events.startsAt, at), gt(events.endsAt, at)))
    .orderBy(desc(events.startsAt))
    .limit(1);
  return rows[0] ?? null;
}

async function findUpcoming(at: Date): Promise<EventRow | null> {
  const rows = await db.select().from(events).where(gt(events.startsAt, at)).orderBy(asc(events.startsAt)).limit(1);
  return rows[0] ?? null;
}

export async function getEventRow(id: string): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("イベントが見つかりませんでした");
  const row = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!row) throw notFound("イベントが見つかりませんでした");
  return row;
}

export async function listEvents(at: Date) {
  const rows = await db.select().from(events).where(lte(events.startsAt, at)).orderBy(desc(events.startsAt)).limit(30);
  return Promise.all(rows.map((r) => toEventDTO(r, at)));
}

// ------------------------------------------------------------------ 色の割り当て
/**
 * 参加者に色を割り当てる。まだ埋まっていないマスが多く、担当者の少ない色を優先する
 * （みんなで協力して絵が完成するように、偏りなく割り振る）。
 */
export async function assignColor(eventId: string, userId: string): Promise<number> {
  const existing = await db.query.eventParticipants.findFirst({
    where: and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)),
  });
  const stats = await colorStats(eventId);
  if (existing) {
    const s = stats.get(existing.colorIndex);
    if (s && s.filled < s.total) return existing.colorIndex;
  }
  const assigned = await db
    .select({ colorIndex: eventParticipants.colorIndex, n: sql<number>`count(*)::int` })
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, eventId))
    .groupBy(eventParticipants.colorIndex);
  const assignedMap = new Map(assigned.map((a) => [a.colorIndex, a.n]));
  let best = -1;
  let bestScore = -1;
  for (const [index, s] of stats) {
    const remaining = s.total - s.filled;
    if (remaining <= 0) continue;
    const score = remaining / (1 + (assignedMap.get(index) ?? 0)) + Math.random() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  if (best < 0) return existing?.colorIndex ?? 0; // すべて埋まっている（完成）
  if (existing) {
    await db
      .update(eventParticipants)
      .set({ colorIndex: best, assignedAt: new Date() })
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)));
    return best;
  }
  await db.insert(eventParticipants).values({ eventId, userId, colorIndex: best }).onConflictDoNothing();
  const row = await db.query.eventParticipants.findFirst({
    where: and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)),
  });
  return row?.colorIndex ?? best;
}

/** 閲覧者の担当色（開催中なら必要に応じて割り当てる） */
async function myColorOf(ev: EventRow, userId: string, at: Date): Promise<MyEventColor> {
  if (eventStatus(ev, at) !== "active") {
    const p = await db.query.eventParticipants.findFirst({
      where: and(eq(eventParticipants.eventId, ev.id), eq(eventParticipants.userId, userId)),
    });
    if (!p) return null;
    return { index: p.colorIndex, ...ev.palette[p.colorIndex], myPosts: await countMyCells(ev.id, userId) };
  }
  const index = await assignColor(ev.id, userId);
  const c = ev.palette[index];
  return { index, hex: c.hex, name: c.name, myPosts: await countMyCells(ev.id, userId) };
}

async function countMyCells(eventId: string, userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventCells)
    .where(and(eq(eventCells.eventId, eventId), eq(eventCells.userId, userId), isNotNull(eventCells.postId)));
  return row?.n ?? 0;
}

/** 予約されていたイベントが始まっていたら、開始のお知らせを送る（cron 不要） */
export async function ensureStartNotifications(at: Date): Promise<void> {
  const due = await db
    .select()
    .from(events)
    .where(and(lte(events.startsAt, at), gt(events.endsAt, at), isNull(events.notifiedAt)));
  for (const ev of due) await notifyEventStart(ev);
}

/** 開催中のイベントをすべて終了する（新しいイベントを今すぐ始めるとき） */
export async function endActiveEvents(at: Date): Promise<number> {
  const active = await db
    .select({ id: events.id })
    .from(events)
    .where(and(lte(events.startsAt, at), gt(events.endsAt, at)));
  for (const e of active) await endEventNow(e.id, at);
  return active.length;
}

/** 管理者: イベントの名前・説明・終了日時を変更する */
export async function updateEvent(id: string, patch: { title?: string; description?: string; endsAt?: Date }) {
  const row = await getEventRow(id);
  if (patch.endsAt && patch.endsAt <= row.startsAt) throw badRequest("終了日時は開始日時より後にしてください");
  const [u] = await db
    .update(events)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.endsAt ? { endsAt: patch.endsAt } : {}),
    })
    .where(eq(events.id, id))
    .returning();
  return u;
}

/** 管理者: 開始前のイベントを取り消す */
export async function deleteUpcomingEvent(id: string, at: Date) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("イベントが見つかりませんでした");
  const rows = await db
    .delete(events)
    .where(and(eq(events.id, id), gt(events.startsAt, at)))
    .returning({ id: events.id });
  if (rows.length === 0) throw badRequest("開始前のイベントのみ取り消せます");
}

/** 管理者: 予定・開催中・終了済みのすべてのイベント（新しい順） */
export async function listAllEvents(at: Date) {
  const rows = await db.select().from(events).orderBy(desc(events.startsAt)).limit(50);
  return Promise.all(rows.map((r) => toEventDTO(r, at)));
}

export async function getCurrentEventInfo(viewer: ViewerCtx, at: Date): Promise<CurrentEventResponse> {
  await ensureAutoEvent(at);
  await ensureStartNotifications(at);
  const [cur, upcoming] = await Promise.all([findCurrentEvent(at), findUpcoming(at)]);
  return {
    event: cur ? await toEventDTO(cur, at) : null,
    myColor: cur ? await myColorOf(cur, viewer.id, at) : null,
    upcoming: upcoming ? await toEventDTO(upcoming, at) : null,
    serverNow: at.toISOString(),
  };
}

/** イベントの詳細（ピクセルアートの全マス） */
export async function getEventDetail(viewer: ViewerCtx, eventId: string, at: Date): Promise<EventDetailResponse> {
  const ev = await getEventRow(eventId);
  if (ev.startsAt > at && viewer.role !== "admin") throw notFound("イベントが見つかりませんでした");
  const cellRows = await db
    .select({ i: eventCells.cellIndex, c: eventCells.colorIndex, postId: eventCells.postId, tile: posts.tile, status: posts.status })
    .from(eventCells)
    .leftJoin(posts, eq(posts.id, eventCells.postId))
    .where(eq(eventCells.eventId, eventId))
    .orderBy(asc(eventCells.cellIndex));
  const cells: EventCellDTO[] = cellRows.map((r) => {
    const ok = r.postId && r.status === "visible";
    return { i: r.i, c: r.c, postId: ok ? r.postId : null, tile: ok ? r.tile : null };
  });
  return {
    event: await toEventDTO(ev, at),
    cells,
    myColor: await myColorOf(ev, viewer.id, at),
    serverNow: at.toISOString(),
  };
}

// ------------------------------------------------------------------ 投稿

/**
 * イベントに投稿する: 指定された色が画面に十分含まれているか判定し、合格ならその色の空いているマスを1つ埋める。
 */
export async function createEventPost(
  viewer: ViewerCtx,
  eventId: string,
  input: Omit<CreatePostInput, "themeId">,
  image: Buffer,
  at: Date,
): Promise<EventPostResult> {
  const ev = await getEventRow(eventId);
  const status = eventStatus(ev, at);
  if (status === "upcoming") throw badRequest("このイベントはまだ始まっていません");
  if (status === "ended") throw badRequest("このイベントは終了しました");
  if (status === "completed") throw conflict("この絵はすでに完成しました。ご協力ありがとうございました", "event_completed");

  const colorIndex = await assignColor(ev.id, viewer.id);
  const target = ev.palette[colorIndex];
  const processed = await processPostImage(image);
  const coverage = colorCoverage(processed.analysis.data, 3, target.hex, ev.deltaE);
  if (coverage < ev.threshold) {
    throw badRequest(
      `指定の色「${target.name}」が足りません（写真の${Math.round(coverage * 100)}%。${Math.round(ev.threshold * 100)}%以上必要です）`,
      { coverage, required: ev.threshold, color: target },
    );
  }

  const row = await insertPost(viewer, { ...input, kind: "event", themeId: null, eventId: ev.id }, processed, at);
  // その色の空いているマスを1つ選んで埋める（同時に投稿されても重ならないようにロックする）
  const claimed = await db.execute<{ cell_index: number }>(sql`
    UPDATE ${eventCells} SET post_id = ${row.id}, user_id = ${viewer.id}, coverage = ${coverage}, filled_at = ${at.toISOString()}::timestamptz
    WHERE event_id = ${ev.id} AND cell_index = (
      SELECT cell_index FROM ${eventCells}
      WHERE event_id = ${ev.id} AND color_index = ${colorIndex} AND post_id IS NULL
      ORDER BY random() LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING cell_index
  `);
  if (claimed.length === 0) {
    // ちょうど同じ色のマスが埋まりきった
    await db.update(posts).set({ status: "deleted" }).where(eq(posts.id, row.id));
    await deletePostImages(row.imageKey);
    await assignColor(ev.id, viewer.id);
    throw conflict("あなたの色のマスはすべて埋まりました。新しい色を割り当てたので、もう一度撮ってみてください", "color_full");
  }

  // すべてのマスが埋まったら完成
  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(eventCells)
    .where(and(eq(eventCells.eventId, ev.id), isNull(eventCells.postId)));
  let completed = false;
  if (remaining === 0) {
    const done = await db
      .update(events)
      .set({ completedAt: at })
      .where(and(eq(events.id, ev.id), isNull(events.completedAt)))
      .returning({ id: events.id });
    completed = done.length > 0;
    if (completed) {
      const ps = await db.select({ id: eventParticipants.userId }).from(eventParticipants).where(eq(eventParticipants.eventId, ev.id));
      await notifyUsers(
        ps.map((p) => p.id),
        { title: ev.title, eventId: ev.id, message: `イベント「${ev.title}」の絵が完成しました！ご協力ありがとうございました` },
        at,
      );
    }
  }
  const [post] = await hydratePosts([row], viewer, at);
  return { post, cellIndex: claimed[0].cell_index, coverage, completed };
}

/** 管理者・デバッグ: 今すぐ終了する */
export async function endEventNow(id: string, at: Date) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("イベントが見つかりませんでした");
  const [row] = await db
    .update(events)
    .set({ endsAt: at })
    .where(and(eq(events.id, id), lte(events.startsAt, at), gt(events.endsAt, at)))
    .returning();
  if (!row) throw badRequest("開催中のイベントではありません");
  return row;
}
