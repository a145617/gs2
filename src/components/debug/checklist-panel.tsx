"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import clsx from "clsx";
import { Panel } from "./shared";

// 仕様書の各項目と、その確認のしかた（確認済みの印はこの端末だけに保存する）

type Item = { id: string; group: "機能" | "要件"; title: string; how: string; links: { href: string; label: string }[] };

const ITEMS: Item[] = [
  {
    id: "post",
    group: "機能",
    title: "写真を撮影して投稿する",
    how: "撮影画面で撮影（カメラが無ければ疑似カメラ）し、タイトル・キャプション・ハッシュタグを付けて投稿します。",
    links: [{ href: "/camera", label: "撮影画面" }, { href: "#device", label: "疑似カメラ" }],
  },
  {
    id: "daily",
    group: "機能",
    title: "毎朝5時に抽象的なお題が出る",
    how: "時計の「次の朝5時の30秒前へ」を押してホームを開くと、残り時間が0になったところで次のお題に切り替わります。",
    links: [{ href: "#clock", label: "時計" }, { href: "/", label: "ホーム" }],
  },
  {
    id: "gate",
    group: "機能",
    title: "投稿すると、ほかの人の投稿が見られる",
    how: "ダミーの投稿を作ってから「ユーザーを3人追加」で増やした（まだ投稿していない）テスト用ユーザーに切り替えると、今日のお題の投稿がぼかされて見えません。その人で投稿すると見えるようになります。",
    links: [{ href: "#data", label: "テスト用のデータ" }, { href: "#users", label: "切り替え" }],
  },
  {
    id: "social",
    group: "機能",
    title: "いいね・ブックマーク・コメント・ハッシュタグ",
    how: "投稿を開いて操作します。ハッシュタグを押すと同じタグの投稿一覧、マイページからブックマーク一覧を開けます。",
    links: [{ href: "/", label: "ホーム" }, { href: "/bookmarks", label: "ブックマーク" }],
  },
  {
    id: "templates",
    group: "機能",
    title: "お題ごとに投稿の見せ方が変わる",
    how: "お題の表示テンプレート（窓・額縁・水面など12種類）を選んで開始し、投稿の見え方が変わることを確認します。",
    links: [{ href: "#theme", label: "お題" }, { href: "/design/templates", label: "12種類の見本" }],
  },
  {
    id: "event",
    group: "機能",
    title: "不定期のイベントで、色を集めてピクセルアートを完成させる",
    how: "イベントを開始し、担当の色が写った写真（疑似カメラなら自動で映ります）を投稿するとマスが埋まります。「全部埋めて完成させる」で完成まで確認できます。",
    links: [{ href: "#event", label: "イベント" }, { href: "/event", label: "イベント画面" }],
  },
  {
    id: "feed",
    group: "機能",
    title: "フィード（フォロー中の人が先、その後は人気・好みに合わせてランダム）",
    how: "ダミーの投稿を作ると、ホームの上部に「フォロー中の人の投稿」、その後に「おすすめ」が並びます。並び順の内訳を表示すると点数を確認できます。",
    links: [{ href: "#data", label: "テスト用のデータ" }, { href: "#device", label: "内訳の表示" }, { href: "/", label: "ホーム" }],
  },
  {
    id: "search",
    group: "機能",
    title: "タイトル・キャプション・ハッシュタグで検索できる",
    how: "さがす画面で、ダミーの投稿のタイトル（例: 帰り道）やハッシュタグ（例: #散歩）で検索します。",
    links: [{ href: "/explore", label: "さがす" }],
  },
  {
    id: "account",
    group: "機能",
    title: "アイコン・ユーザー名・自動で付くユーザーID",
    how: "設定でアイコン（画像）とユーザー名を変更できます。ユーザーID（@から始まる）は登録時に自動で付き、変わりません。",
    links: [{ href: "/settings", label: "設定" }, { href: "/me", label: "マイページ" }],
  },
  {
    id: "report",
    group: "機能",
    title: "不適切な投稿の通報",
    how: "投稿の「…」から理由を選んで通報します。テスト用ユーザーから3件通報されると自動で非表示になり、管理画面の「通報」で処理できます。",
    links: [{ href: "#data", label: "通報を送る" }, { href: "/admin/reports", label: "管理画面の通報" }],
  },
  {
    id: "mute",
    group: "機能",
    title: "特定のユーザーの投稿を表示しないミュート",
    how: "テスト用ユーザーのプロフィールの「…」からミュートすると、その人の投稿・コメントが表示されなくなります。設定から解除できます。",
    links: [{ href: "/settings", label: "設定（ミュート中のユーザー）" }],
  },
  {
    id: "login",
    group: "要件",
    title: "アカウント・ログイン",
    how: "新規登録・ログイン・ログアウト・パスワードの変更・退会ができます。",
    links: [{ href: "/settings", label: "設定" }],
  },
  {
    id: "raw",
    group: "要件",
    title: "RAW・シャッタースピード・ISO・絞りの手動設定（対応するものだけ有効）",
    how: "「カメラの手動設定への対応を調べる」で、この端末で設定できる項目を確認できます。撮影画面にも同じ内容が表示され、全く対応しない端末では通常の撮影になります。RAWはサンプルのDNGで確認できます。",
    links: [{ href: "#device", label: "端末・カメラ" }, { href: "/camera", label: "撮影画面" }],
  },
  {
    id: "admin",
    group: "要件",
    title: "管理者（投稿・コメントの編集と削除、警告と削除、お題・イベントの開催）",
    how: "「テスト管理者で操作」に切り替えると、管理画面ですべての管理機能を確認できます。",
    links: [{ href: "#users", label: "切り替え" }, { href: "/admin", label: "管理画面" }],
  },
  {
    id: "debug",
    group: "要件",
    title: "デバッグモード",
    how: "この画面です。自己診断で、サーバー側の各機能がこの環境で動くことを確認できます。",
    links: [{ href: "#selftest", label: "自己診断" }],
  },
  {
    id: "devices",
    group: "要件",
    title: "Android・iOS の Chrome・Firefox・Safari",
    how: "それぞれの端末・ブラウザでこの画面を開き、「端末・カメラ」の対応状況と、各機能の確認を行います。",
    links: [{ href: "#device", label: "端末・カメラ" }],
  },
  {
    id: "design",
    group: "要件",
    title: "ニューモーフィズムを基調に、グラスモーフィズムの要素",
    how: "浮き出し・くぼみの部品と、すりガラスのヘッダー・タブバー・シートを一覧で確認できます。",
    links: [{ href: "/design", label: "デザインの見本" }],
  },
];

const KEY = "hk:debugChecklist";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function toggle(id: string) {
  const set = new Set<string>(JSON.parse(readRaw()) as string[]);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // 保存できなくても無視
  }
  for (const l of listeners) l();
}

/** 仕様書の各項目の確認リスト */
export function ChecklistPanel() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const done = new Set<string>(JSON.parse(raw) as string[]);
  const count = ITEMS.filter((i) => done.has(i.id)).length;

  return (
    <Panel
      id="checklist"
      icon={<ListChecks size={20} />}
      title="仕様の確認リスト"
      description={`仕様書のすべての項目と、その確認のしかたです。確認したら印を付けてください（この端末に保存されます）。確認済み ${count} / ${ITEMS.length}`}
    >
      {(["機能", "要件"] as const).map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <p className="px-1 text-[13px] font-bold text-ink-3">{g === "機能" ? "サービスの機能" : "要件"}</p>
          <ul className="flex flex-col gap-2" data-testid={`checklist-${g === "機能" ? "features" : "requirements"}`}>
            {ITEMS.filter((i) => i.group === g).map((i) => {
              const checked = done.has(i.id);
              return (
                <li key={i.id} className={clsx("rounded-[16px] px-3 py-2.5", checked ? "neu-inset neu-sm" : "neu neu-sm")} data-testid="checklist-item">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(i.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      aria-label={`${i.title}を確認済みにする`}
                    />
                    <span className="min-w-0">
                      <span className={clsx("block text-sm font-bold", checked ? "text-ink-3 line-through" : "text-ink")}>{i.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{i.how}</span>
                    </span>
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-7">
                    {i.links.map((l) =>
                      l.href.startsWith("#") ? (
                        <a key={l.href} href={l.href} className="text-xs text-accent">
                          {l.label}
                        </a>
                      ) : (
                        <Link key={l.href} href={l.href} className="text-xs text-accent">
                          {l.label}
                        </Link>
                      ),
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
