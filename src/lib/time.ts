// 日本時間（JST, UTC+9・夏時間なし）と「お題の日」（朝5時切り替え）の計算

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const THEME_CHANGE_HOUR = 5;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** 時刻 t が属する「お題の日」（JSTで朝5時に切り替わる）を YYYY-MM-DD で返す */
export function themeDayKey(t: Date): string {
  const shifted = new Date(t.getTime() + JST_OFFSET_MS - THEME_CHANGE_HOUR * HOUR);
  return shifted.toISOString().slice(0, 10);
}

/** お題の日 dayKey の開始時刻（その日の JST 5:00） */
export function themeDayStart(dayKey: string): Date {
  const midnightUtc = Date.parse(`${dayKey}T00:00:00Z`);
  return new Date(midnightUtc - JST_OFFSET_MS + THEME_CHANGE_HOUR * HOUR);
}

/** 時刻 t の次の「朝5時（JST）」 */
export function nextThemeChange(t: Date): Date {
  return new Date(themeDayStart(themeDayKey(t)).getTime() + DAY);
}

/** 時刻 t を含むお題の日の開始（直前の朝5時） */
export function currentThemeDayStart(t: Date): Date {
  return themeDayStart(themeDayKey(t));
}

function jstParts(t: Date) {
  const d = new Date(t.getTime() + JST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    w: d.getUTCDay(),
  };
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 例: 11月18日(水) */
export function formatJstDate(t: Date | string): string {
  const p = jstParts(new Date(t));
  return `${p.m}月${p.d}日(${WEEK[p.w]})`;
}

/** 例: 2026年11月18日(水) 05:00 */
export function formatJstDateTime(t: Date | string, withYear = false): string {
  const p = jstParts(new Date(t));
  const time = `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
  return `${withYear ? `${p.y}年` : ""}${p.m}月${p.d}日(${WEEK[p.w]}) ${time}`;
}

/** お題の日（dayKey）の表示 例: 11月18日(水)のお題 */
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日(${WEEK[w]})`;
}

/** 残り時間の表示 例: 3:05:09 */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 経過時間の表示 例: 3分前 / 2時間前 / 11月18日 */
export function formatRelative(t: Date | string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(t).getTime();
  if (diff < 60 * 1000) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / 60000)}分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}時間前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}日前`;
  return formatJstDate(t);
}

/** 日時入力欄（datetime-local）に入れる値。日本時間で表す 例: 2026-11-18T05:00 */
export function toJstInputValue(t: Date | string): string {
  const p = jstParts(new Date(t));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** 日時入力欄の値（日本時間）を ISO 8601 の文字列にする。空や不正な値なら null */
export function fromJstInputValue(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
