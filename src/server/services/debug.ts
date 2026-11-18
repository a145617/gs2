import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { eventCells, eventParticipants, posts, themePool, users, type UserRow } from "../db/schema";
import { badRequest, HttpError } from "../http/respond";
import { getClockOffsetMs, setClockOffsetMs } from "../clock";
import { processPostImage, type ProcessedPostImage } from "../images";
import { mediaUrl } from "../storage";
import { randomId } from "../auth/tokens";
import { avatarPhoto, loadDemoPhoto, photoForColor, pickDemoPhotos, requireDemoPhoto } from "../debug/demo-photos";
import { purgeUserContent } from "./admin";
import {
  completeIfFilled,
  ensureAutoEvent,
  findCurrentEvent,
  getAutoSchedule,
  getEventRow,
  setAutoSchedule,
  toEventDTO,
} from "./events";
import { createReport } from "./moderation";
import { createThemePost, deletePostImages, insertPost, type ViewerCtx } from "./posts";
import { addComment, bookmarkPost, follow, likePost } from "./social";
import { endThemeNow, getCurrentTheme, getNextChangeAt, startThemeNow, toThemeDTO } from "./themes";
import { createUser, deleteAccount, setAvatar } from "./users";
import { recordViews } from "./views";
import { nextThemeChange } from "@/lib/time";
import type { TemplateKey } from "@/lib/templates";
import { colorCoverage } from "@/lib/color";

// =============================================================================
// デバッグモード: 仕様の各機能を確認するための操作（DEBUG_MODE=true のときだけAPIから呼ばれる）
// =============================================================================

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pick = <T>(xs: readonly T[], r = Math.random()) => xs[Math.floor(r * xs.length) % xs.length];
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// ------------------------------------------------------------------ 仮想時計
export type ClockAction =
  | { type: "add"; ms: number }
  | { type: "set"; at: Date }
  | { type: "reset" }
  /** 次の朝5時（お題の切り替え）の n 秒前へ */
  | { type: "beforeRollover"; seconds: number };

const MAX_OFFSET = 400 * DAY;

export async function shiftClock(action: ClockAction) {
  const real = Date.now();
  let offset = await getClockOffsetMs();
  if (action.type === "add") offset += action.ms;
  if (action.type === "set") offset = action.at.getTime() - real;
  if (action.type === "reset") offset = 0;
  if (action.type === "beforeRollover") {
    const next = nextThemeChange(new Date(real + offset));
    offset = next.getTime() - action.seconds * 1000 - real;
  }
  offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(offset)));
  await setClockOffsetMs(offset);
  return { offsetMs: offset, now: new Date(real + offset) };
}

// ------------------------------------------------------------------ お題
/** 任意の内容（省略時は候補からランダム）のお題を今すぐ始める */
export async function startDebugTheme(
  viewer: ViewerCtx,
  input: { title?: string; description?: string; template?: TemplateKey; endsAt?: Date },
  at: Date,
) {
  let { title, description } = input;
  let template = input.template;
  let accent: string | undefined;
  if (!title) {
    const [p] = await db.select().from(themePool).where(eq(themePool.enabled, true)).orderBy(sql`random()`).limit(1);
    title = p?.title ?? "デバッグのお題";
    description ??= p?.description ?? "";
    if (!template) {
      template = p?.template ?? "window";
      accent = p?.accent;
    }
  }
  return startThemeNow(
    { title, description: description ?? "", template: template ?? "window", accent, endsAt: input.endsAt, source: "debug", createdById: viewer.id },
    at,
  );
}

/** 現在のお題を今すぐ終了する（いつものお題、またはその日の臨時のお題に切り替わる） */
export async function endCurrentTheme(at: Date) {
  const current = await getCurrentTheme(at);
  await endThemeNow(current.id, at);
  return getCurrentTheme(at);
}

// ------------------------------------------------------------------ テスト用ユーザー
const NAMES = ["ハル", "ソラ", "ミナト", "ユイ", "カエデ", "リク", "ツムギ", "アオイ", "レン", "ヒナ", "イツキ", "サク"];

export type TestUser = UserRow & { viewer: ViewerCtx };

export async function listTestUsers(): Promise<UserRow[]> {
  return db
    .select()
    .from(users)
    .where(and(eq(users.isTestUser, true), eq(users.status, "active")))
    .orderBy(asc(users.createdAt));
}

async function makeTestUser(displayName: string, seed: number, role: "user" | "admin" = "user") {
  const u = await createUser({
    email: `debug-${randomId(10).toLowerCase()}@hitokoma.test`,
    // テスト用ユーザーには「切り替え」でだけ入れる（パスワードは誰にも分からない値にする）
    password: randomBytes(24).toString("base64url"),
    displayName,
    role,
    isTestUser: true,
  });
  const image = await loadDemoPhoto(avatarPhoto(seed));
  return image ? setAvatar(u.id, image) : u;
}

/** テスト用ユーザーを n 人そろえる（足りなければ作る） */
export async function ensureTestUsers(n: number): Promise<TestUser[]> {
  const existing = (await listTestUsers()).filter((u) => u.role === "user");
  const out = [...existing];
  for (let i = existing.length; i < n; i++) {
    const base = NAMES[i % NAMES.length];
    const suffix = i >= NAMES.length ? String(Math.floor(i / NAMES.length) + 1) : "";
    out.push(await makeTestUser(`テスト・${base}${suffix}`, i));
  }
  return out.slice(0, Math.max(0, n)).map((u) => ({ ...u, viewer: { id: u.id, role: u.role } }));
}

/** 管理者機能の確認用のテスト管理者（なければ作る） */
export async function ensureTestAdmin(): Promise<UserRow> {
  const found = (await listTestUsers()).find((u) => u.role === "admin");
  return found ?? makeTestUser("テスト・管理者", 99, "admin");
}

// ------------------------------------------------------------------ ダミーデータ
const SENTENCES = [
  "いつもの道で見つけた一枚。",
  "少しだけ立ち止まって撮りました。",
  "この色が好きです。",
  "光がきれいだったので。",
  "なんでもない瞬間を残したくて。",
  "ふと見上げたら、こうなっていました。",
];
const COMMENTS = [
  "素敵な色ですね",
  "この光、好きです",
  "構図がいいですね！",
  "見ていて落ち着きます",
  "どこで撮ったんですか？",
  "空気感が伝わってきます",
  "真似したくなりました",
];
/** 想定内の失敗（見られない投稿・二重の操作など 4xx）は無視して続ける */
async function safe(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    if (e instanceof HttpError && e.status < 500) return false;
    throw e;
  }
}

export type SeedResult = {
  users: number;
  posts: number;
  /** そのうち、お題に合う写真を使った投稿の数 */
  matched: number;
  likes: number;
  comments: number;
  follows: number;
};

/**
 * テスト用ユーザーに、今日のお題への投稿・いいね・ブックマーク・コメント・フォロー・閲覧を作らせる。
 * 自分（操作している人）も2人をフォローし、自分の投稿にはいいね・コメントが付く（フィード・お知らせの確認用）。
 */
export async function seedDemoData(viewer: ViewerCtx, opts: { users?: number; postsPerUser?: number }, at: Date): Promise<SeedResult> {
  const n = Math.max(1, Math.min(12, opts.users ?? 6));
  const per = Math.max(1, Math.min(4, opts.postsPerUser ?? 2));
  const theme = await getCurrentTheme(at);
  const people = await ensureTestUsers(n);
  const created: { id: string; userId: string }[] = [];
  const start = Math.max(theme.startsAt.getTime(), at.getTime() - 3 * HOUR);
  const result: SeedResult = { users: people.length, posts: 0, matched: 0, likes: 0, comments: 0, follows: 0 };
  // Unsplash の写真（assets/demo-photos）から、お題に合うものを優先して選ぶ（足りなければほかの写真）
  const { photos, matched } = pickDemoPhotos({ title: theme.title, description: theme.description }, n * per);
  let next = 0;

  for (const p of people) {
    for (let k = 0; k < per; k++) {
      const photoIndex = next++;
      const photo = photos[photoIndex % photos.length];
      const [tag1, tag2] = photo.tags;
      try {
        const { post } = await createThemePost(
          p.viewer,
          {
            title: photo.title,
            caption: `${pick(SENTENCES)} #${theme.title.replace(/\s+/g, "")} #${tag1}\n写真: ${photo.by}（Unsplash）`,
            tags: [tag2],
            themeId: theme.id,
            meta: { mode: "library" },
          },
          await requireDemoPhoto(photo),
          at,
        );
        if (photoIndex < matched) result.matched++;
        // 投稿時刻を少しずつずらす（新しい順の一覧・フィードの確認用）
        const when = new Date(start + Math.random() * Math.max(0, at.getTime() - start));
        await db.update(posts).set({ createdAt: when, updatedAt: when }).where(eq(posts.id, post.id));
        created.push({ id: post.id, userId: p.id });
        result.posts++;
      } catch (e) {
        // 1日の投稿数の上限に達したら、その人はそれ以上投稿しない
        if (e instanceof HttpError && e.status === 429) break;
        throw e;
      }
    }
  }

  for (const p of people) {
    const others = created.filter((x) => x.userId !== p.id);
    for (const o of others) {
      if (Math.random() < 0.45 && (await safe(() => likePost(p.viewer, o.id, at)))) result.likes++;
      if (Math.random() < 0.15) await safe(() => bookmarkPost(p.viewer, o.id, at));
      if (Math.random() < 0.18 && (await safe(() => addComment(p.viewer, o.id, pick(COMMENTS), at)))) result.comments++;
    }
    const seen = others.filter(() => Math.random() < 0.7).map((o) => o.id);
    for (let i = 0; i < seen.length; i += 50) await recordViews(p.viewer, seen.slice(i, i + 50), at);
    for (const q of people) {
      if (q.id !== p.id && Math.random() < 0.35 && (await safe(() => follow(p.viewer, q.id, at)))) result.follows++;
    }
  }

  // 操作している人: 2人をフォローし（フィードの「フォロー中の人の投稿」の確認用）、2人にフォローされる
  if (!people.some((p) => p.id === viewer.id)) {
    for (const q of people.slice(0, 2)) {
      if (await safe(() => follow(viewer, q.id, at))) result.follows++;
      if (await safe(() => follow(q.viewer, viewer.id, at))) result.follows++;
    }
    // 自分の今日の投稿に、いいね・コメントが付く（お知らせの確認用）
    const mine = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.userId, viewer.id), eq(posts.themeId, theme.id), eq(posts.status, "visible")))
      .orderBy(desc(posts.createdAt))
      .limit(3);
    for (const m of mine) {
      for (const p of people.slice(0, 3)) {
        if (await safe(() => likePost(p.viewer, m.id, at))) result.likes++;
      }
    }
    if (mine[0] && people[0] && (await safe(() => addComment(people[0].viewer, mine[0].id, pick(COMMENTS), at)))) {
      result.comments++;
    }
  }
  return result;
}

/** テスト用ユーザーと、その投稿・コメント・いいねなどをすべて削除する */
export async function purgeTestData(): Promise<{ users: number; posts: number }> {
  const list = await listTestUsers();
  let postCount = 0;
  for (const u of list) {
    postCount += (await purgeUserContent(u.id)).posts;
    await deleteAccount(u.id);
  }
  return { users: list.length, posts: postCount };
}

// ------------------------------------------------------------------ イベント
/**
 * 開催中のイベントの空いているマスを、テスト用ユーザーの写真で埋める（count 個、または全部）。
 * 全部埋まればイベントが完成し、参加者にお知らせが届く。
 */
export async function fillEventCells(eventId: string | null, countOrAll: number | "all", at: Date) {
  const ev = eventId ? await getEventRow(eventId) : await findCurrentEvent(at);
  if (!ev || ev.startsAt > at || ev.endsAt <= at) throw badRequest("開催中のイベントがありません");
  const empty = shuffle(
    await db
      .select({ i: eventCells.cellIndex, c: eventCells.colorIndex })
      .from(eventCells)
      .where(and(eq(eventCells.eventId, ev.id), isNull(eventCells.postId))),
  );
  const limit = countOrAll === "all" ? 600 : Math.max(1, Math.min(600, countOrAll));
  const targets = empty.slice(0, limit);
  const people = targets.length > 0 ? await ensureTestUsers(Math.min(8, Math.max(3, ev.palette.length))) : [];
  // 同じ写真の処理（縮小など）は1回だけ行う
  const images = new Map<string, ProcessedPostImage>();
  let filled = 0;
  for (const [k, cell] of targets.entries()) {
    const p = people[k % people.length];
    const color = ev.palette[cell.c];
    await db
      .insert(eventParticipants)
      .values({ eventId: ev.id, userId: p.id, colorIndex: cell.c })
      .onConflictDoUpdate({ target: [eventParticipants.eventId, eventParticipants.userId], set: { colorIndex: cell.c } });
    const photo = photoForColor(color.hex);
    let processed = images.get(photo.id);
    if (!processed) {
      processed = await processPostImage(await requireDemoPhoto(photo));
      images.set(photo.id, processed);
    }
    const coverage = colorCoverage(processed.analysis.data, 3, color.hex, ev.deltaE);
    const row = await insertPost(
      p.viewer,
      {
        title: photo.title,
        caption: `「${color.name}」の1ピクセルに\n写真: ${photo.by}（Unsplash）`,
        tags: [],
        meta: { mode: "library" },
        kind: "event",
        themeId: null,
        eventId: ev.id,
      },
      processed,
      at,
    );
    const claimed = await db
      .update(eventCells)
      .set({ postId: row.id, userId: p.id, coverage, filledAt: at })
      .where(and(eq(eventCells.eventId, ev.id), eq(eventCells.cellIndex, cell.i), isNull(eventCells.postId)))
      .returning({ i: eventCells.cellIndex });
    if (claimed.length === 0) {
      // ちょうど誰かが埋めた
      await db.update(posts).set({ status: "deleted" }).where(eq(posts.id, row.id));
      await deletePostImages(row.imageKey);
      continue;
    }
    filled++;
  }
  const completed = await completeIfFilled(ev, at);
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(eventCells)
    .where(and(eq(eventCells.eventId, ev.id), isNull(eventCells.postId)));
  return { eventId: ev.id, filled, remaining, completed };
}

/** 「1週間に1度程度の不定期開催」を今すぐ発生させる（開催中のイベントが無いときだけ始まる） */
export async function triggerAutoEvent(at: Date) {
  if (await findCurrentEvent(at)) {
    throw badRequest("開催中のイベントがあるため、自動開催は始まりません。先にイベントを終了してください");
  }
  await setAutoSchedule({ enabled: true, nextAutoAt: new Date(at.getTime() - 1000) });
  await ensureAutoEvent(at);
  const ev = await findCurrentEvent(at);
  if (!ev) throw badRequest("自動開催を始められませんでした");
  return ev;
}

// ------------------------------------------------------------------ 通報
/** テスト用ユーザーから、自分の投稿（省略時は最新の投稿）に通報を送る（自動非表示・管理画面の確認用） */
export async function sendTestReports(viewer: ViewerCtx, input: { postId?: string; count: number }) {
  const n = Math.max(1, Math.min(10, input.count));
  const conds = [eq(posts.userId, viewer.id), ne(posts.status, "deleted")];
  if (input.postId) conds.push(eq(posts.id, input.postId));
  const [target] = await db.select().from(posts).where(and(...conds)).orderBy(desc(posts.createdAt)).limit(1);
  if (!target) throw badRequest("通報を受ける投稿がありません。先に1枚投稿してください");
  const people = await ensureTestUsers(n);
  let sent = 0;
  let autoHidden = false;
  for (const p of people) {
    try {
      const r = await createReport(p.viewer, { targetType: "post", targetId: target.id, reason: "inappropriate", detail: "デバッグモードで送った通報です" });
      sent++;
      autoHidden ||= r.autoHidden;
    } catch (e) {
      if (e instanceof HttpError && e.code === "already_reported") continue;
      throw e;
    }
  }
  return { postId: target.id, title: target.title, sent, autoHidden };
}

// ------------------------------------------------------------------ 状態
export async function getDebugStatus(viewer: { id: string; impersonatorId: string | null }, at: Date) {
  const [offsetMs, theme, event, auto, testUsers] = await Promise.all([
    getClockOffsetMs(),
    getCurrentTheme(at),
    findCurrentEvent(at),
    getAutoSchedule(),
    listTestUsers(),
  ]);
  const ids = testUsers.map((u) => u.id);
  const [{ n: testPosts }] = ids.length
    ? await db
        .select({ n: count() })
        .from(posts)
        .where(and(inArray(posts.userId, ids), ne(posts.status, "deleted")))
    : [{ n: 0 }];
  return {
    now: at.toISOString(),
    realNow: new Date().toISOString(),
    offsetMs,
    theme: toThemeDTO(theme, at),
    nextChangeAt: (await getNextChangeAt(theme, at)).toISOString(),
    event: event ? await toEventDTO(event, at) : null,
    eventAuto: auto,
    testUsers: testUsers.map((u) => ({
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: mediaUrl(u.avatarKey),
      role: u.role,
    })),
    testPosts,
    viewerId: viewer.id,
    impersonating: !!viewer.impersonatorId,
  };
}
