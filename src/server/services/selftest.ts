import { sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db/client";
import { env } from "../env";
import { getClockOffsetMs, now } from "../clock";
import { hashPassword, verifyPassword } from "../auth/password";
import { randomId } from "../auth/tokens";
import { processPostImage } from "../images";
import { deleteObject, getObject, putObject } from "../storage";
import { getSetting, SETTING_KEYS } from "../settings";
import { DEFAULT_AUTO_HIDE } from "./moderation";
import { isLocked, type GateInfo } from "./posts";
import { getCurrentTheme } from "./themes";
import { popularity } from "./feed";
import { colorCoverage } from "@/lib/color";
import { collectTags, extractTags } from "@/lib/hashtags";
import { PRESETS, PRESET_KEYS } from "@/lib/pixel-art";
import { normalizeForSearch, splitQuery } from "@/lib/search";
import { isTemplateKey } from "@/lib/templates";
import { nextThemeChange, themeDayKey } from "@/lib/time";

// =============================================================================
// デバッグモードの自己診断。サーバー側の各機能（DB・画像の保存・写真の処理・お題の切り替え計算など）を
// その環境で実際に動かして確かめる（デプロイ先での動作確認にも使う）。
// =============================================================================

export type SelfTestResult = { id: string; name: string; ok: boolean; detail: string; ms: number };

type Check = { id: string; name: string; run: () => Promise<string> };

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const REQUIRED_TABLES = [
  "users", "sessions", "themes", "theme_pool", "posts", "hashtags", "likes", "bookmarks", "comments", "follows",
  "notifications", "mutes", "reports", "post_views", "events", "event_cells", "event_participants", "warnings", "audit_logs",
];

const CHECKS: Check[] = [
  {
    id: "db",
    name: "データベースに接続でき、必要な表がそろっている",
    run: async () => {
      const rows = await db.execute<{ name: string; ok: boolean }>(
        sql`SELECT t AS name, to_regclass(t) IS NOT NULL AS ok FROM unnest(${sql.raw(`ARRAY[${REQUIRED_TABLES.map((t) => `'${t}'`).join(",")}]`)}) AS t`,
      );
      const missing = rows.filter((r) => !r.ok).map((r) => r.name);
      assert(missing.length === 0, `足りない表: ${missing.join(", ")}（npm run db:migrate を実行してください）`);
      return `${REQUIRED_TABLES.length}個の表を確認`;
    },
  },
  {
    id: "storage",
    name: "画像の保存・読み出し・削除ができる（ストレージ）",
    run: async () => {
      const key = `selftest/${randomId(16)}.txt`;
      const body = Buffer.from(`hitokoma selftest ${Date.now()}`);
      await putObject(key, body, "text/plain");
      const got = await getObject(key);
      assert(got, "保存したファイルを読み出せません");
      const bytes =
        got.body instanceof Uint8Array ? Buffer.from(got.body) : Buffer.from(await new Response(got.body as ReadableStream).arrayBuffer());
      assert(bytes.equals(body), "読み出した内容が保存した内容と違います");
      await deleteObject(key);
      return `${env.storageDriver === "blob" ? "Vercel Blob" : "ローカル（.data/uploads）"} に ${body.length} バイトを保存して読み出し、削除`;
    },
  },
  {
    id: "image",
    name: "写真の処理（向きの補正・3サイズのWebP・位置情報などのメタデータの削除）",
    run: async () => {
      const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#4a8fd8" } })
        .withExif({ IFD0: { Make: "SelfTest", Model: "Cam", Software: "secret" } })
        .jpeg()
        .toBuffer();
      const p = await processPostImage(jpeg);
      const meta = await sharp(p.lg).metadata();
      assert(meta.format === "webp", "WebP に変換されていません");
      assert(p.width === 1600 && p.height === 1200, `大きさが違います（${p.width}×${p.height}）`);
      assert(!meta.exif, "撮影情報（EXIF）が残っています");
      assert(p.tile.startsWith("data:image/webp"), "イベント用の小さな画像が作られていません");
      return `lg ${p.lg.length}B / md ${p.md.length}B / sm ${p.sm.length}B、EXIFなし、代表色 ${p.colors.dominant.join(" ")}`;
    },
  },
  {
    id: "rollover",
    name: "お題は日本時間の朝5時に切り替わる（日付の計算）",
    run: async () => {
      const before = new Date("2026-11-18T04:59:59+09:00");
      const after = new Date("2026-11-18T05:00:00+09:00");
      assert(themeDayKey(before) === "2026-11-17", `4:59 のお題の日が ${themeDayKey(before)} になっています`);
      assert(themeDayKey(after) === "2026-11-18", `5:00 のお題の日が ${themeDayKey(after)} になっています`);
      assert(nextThemeChange(before).getTime() === after.getTime(), "4:59 の次の切り替えが 5:00 になっていません");
      return "4:59:59 → 前日のお題、5:00:00 → 当日のお題";
    },
  },
  {
    id: "theme",
    name: "今のお題が決まっている",
    run: async () => {
      const at = await now();
      const t = await getCurrentTheme(at);
      assert(t.startsAt <= at && t.endsAt > at, "今の時刻を含むお題がありません");
      assert(isTemplateKey(t.template), `表示テンプレートが正しくありません（${t.template}）`);
      return `「${t.title}」（${t.template}・${t.source}）`;
    },
  },
  {
    id: "gate",
    name: "今日のお題への他の人の投稿は、自分が投稿するまで見えない",
    run: async () => {
      const row = { kind: "theme" as const, themeId: "today", userId: "other" };
      const notYet: GateInfo = { currentThemeId: "today", viewerPostedCurrent: false };
      const posted: GateInfo = { currentThemeId: "today", viewerPostedCurrent: true };
      assert(isLocked(row, { id: "me", role: "user" }, notYet), "投稿前なのに見えてしまいます");
      assert(!isLocked(row, { id: "me", role: "user" }, posted), "投稿したのに見えません");
      assert(!isLocked({ ...row, themeId: "yesterday" }, { id: "me", role: "user" }, notYet), "過去のお題の投稿が見えません");
      assert(!isLocked({ ...row, userId: "me" }, { id: "me", role: "user" }, notYet), "自分の投稿が見えません");
      assert(!isLocked(row, { id: "admin", role: "admin" }, notYet), "管理者が確認できません");
      return "投稿前: 見えない / 投稿後: 見える / 過去のお題・自分の投稿・管理者: 見える";
    },
  },
  {
    id: "color",
    name: "イベントの色の判定（指定の色が画面に多く写っているか）",
    run: async () => {
      const red = Buffer.alloc(64 * 64 * 3);
      for (let i = 0; i < red.length; i += 3) [red[i], red[i + 1], red[i + 2]] = [214, 69, 69];
      const hit = colorCoverage(red, 3, "#d64545");
      const miss = colorCoverage(red, 3, "#2f6fd6");
      assert(hit > 0.9, `同じ色なのに割合が ${hit.toFixed(2)} です`);
      assert(miss < 0.05, `違う色なのに割合が ${miss.toFixed(2)} です`);
      for (const k of PRESET_KEYS) {
        const art = PRESETS[k].build(12, 12);
        assert(art.cells.length === 144 && art.cells.every((c) => c >= 0 && c < art.palette.length), `絵「${k}」のデータが正しくありません`);
      }
      return `赤の写真 × 赤: ${(hit * 100).toFixed(0)}% / × 青: ${(miss * 100).toFixed(0)}%、絵 ${PRESET_KEYS.length}種類`;
    },
  },
  {
    id: "search",
    name: "検索語・ハッシュタグの正規化（全角・大文字・空白のゆれ）",
    run: async () => {
      assert(normalizeForSearch("  ＳＫＹ　Blue ") === "sky blue", "全角・大文字・空白が正規化されていません");
      assert(splitQuery("空　 夕焼け ＃海").join("|") === "空|夕焼け|#海", "検索語の分割が正しくありません");
      assert(extractTags("きれい #夕焼け と ＃ＳＵＮ").join("|") === "夕焼け|sun", "キャプション中のハッシュタグを取り出せません");
      assert(collectTags("#空 空, 海", "#海").join("|") === "空|海", "ハッシュタグの重複がまとめられていません");
      return "「ＳＫＹ　Blue」→「sky blue」、#夕焼け ＃ＳＵＮ → 夕焼け, sun";
    },
  },
  {
    id: "feed",
    name: "フィードの人気度（いいね・閲覧が多い新しい投稿ほど高い）",
    run: async () => {
      const at = new Date();
      const base = { likeCount: 0, commentCount: 0, bookmarkCount: 0, viewCount: 0, createdAt: at };
      const liked = popularity({ ...base, likeCount: 20, viewCount: 100 }, at);
      const plain = popularity(base, at);
      const old = popularity({ ...base, likeCount: 20, viewCount: 100, createdAt: new Date(at.getTime() - 7 * 86400_000) }, at);
      assert(liked > plain, "いいね・閲覧が多い投稿の人気度が高くなっていません");
      assert(liked > old, "新しい投稿のほうが高くなっていません");
      return `人気 ${liked.toFixed(2)} > 新着 ${plain.toFixed(2)}、1週間前 ${old.toFixed(2)}`;
    },
  },
  {
    id: "password",
    name: "パスワードの保存（scrypt でハッシュ化し、照合できる）",
    run: async () => {
      const h = await hashPassword("selftest-password");
      assert(!h.includes("selftest-password"), "パスワードがそのまま保存されています");
      assert(await verifyPassword("selftest-password", h), "正しいパスワードで照合できません");
      assert(!(await verifyPassword("wrong-password", h)), "違うパスワードで照合できてしまいます");
      return "ハッシュ化と照合に成功";
    },
  },
  {
    id: "clock",
    name: "仮想時計（デバッグ用に時刻を進められる）",
    run: async () => {
      const offset = await getClockOffsetMs();
      const t = await now();
      assert(Math.abs(t.getTime() - (Date.now() + offset)) < 5000, "アプリの時刻が仮想時計とずれています");
      const h = Math.round(offset / 3600_000);
      return offset === 0 ? "実際の時刻で動作中" : `実際の時刻から ${h >= 0 ? "+" : ""}${h}時間ずらして動作中`;
    },
  },
  {
    id: "settings",
    name: "アプリの設定（投稿数の上限・通報による自動非表示）を読める",
    run: async () => {
      const limit = await getSetting<number | null>(SETTING_KEYS.dailyPostLimit, null);
      const hide = await getSetting<number>(SETTING_KEYS.autoHideReports, DEFAULT_AUTO_HIDE);
      return `1日の投稿上限: ${limit ?? "なし"}、自動非表示: ${hide > 0 ? `${hide}件` : "しない"}`;
    },
  },
];

export async function runSelfTests(): Promise<SelfTestResult[]> {
  const out: SelfTestResult[] = [];
  for (const c of CHECKS) {
    const t0 = performance.now();
    try {
      const detail = await c.run();
      out.push({ id: c.id, name: c.name, ok: true, detail, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      out.push({ id: c.id, name: c.name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t0) });
    }
  }
  return out;
}
