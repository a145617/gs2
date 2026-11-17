"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Moon, Sun, Monitor, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { Card, GlassPanel, InsetPanel, SectionTitle } from "@/components/ui/card";
import { TextField, TextArea } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Segmented } from "@/components/ui/segmented";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { applyAccent, useDynamicLight, useThemeMode, type ThemeMode } from "@/lib/client/prefs";
import { requestMotionPermission } from "@/components/shell/light-source";

const ACCENTS = ["#6a7dff", "#d64545", "#3f9b5a", "#e0a32e", "#8a5cc7", "#2f9ab8"];

/** デザインシステムの見本ページ（ニューモーフィズム＋グラスモーフィズムの部品一覧） */
export default function DesignPage() {
  const [mode, setMode] = useThemeMode();
  const [light, setLight] = useDynamicLight();
  const [sheet, setSheet] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(true);
  const toast = useToast();

  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <PageHeader title="デザイン見本" subtitle="ニューモーフィズム × グラスモーフィズム" />

      <section>
        <SectionTitle>表示</SectionTitle>
        <Card className="flex flex-col gap-4">
          <Segmented<ThemeMode>
            ariaLabel="テーマ"
            value={mode}
            onChange={setMode}
            options={[
              { value: "system", label: <span className="inline-flex items-center gap-1"><Monitor size={14} />自動</span> },
              { value: "light", label: <span className="inline-flex items-center gap-1"><Sun size={14} />ライト</span> },
              { value: "dark", label: <span className="inline-flex items-center gap-1"><Moon size={14} />ダーク</span> },
            ]}
          />
          <Toggle
            checked={light}
            onChange={async (v) => {
              if (v) await requestMotionPermission();
              setLight(v);
            }}
            label="光の向きを動かす"
            description="端末の傾きや指の位置に合わせて影と反射が動きます"
          />
          <div className="flex flex-wrap gap-3" aria-label="アクセント色">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`アクセント色 ${c}`}
                onClick={() => applyAccent(c)}
                className="neu neu-sm neu-press h-10 w-10 rounded-full p-1.5"
              >
                <span className="block h-full w-full rounded-full" style={{ background: c }} />
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>ボタン</SectionTitle>
        <Card className="flex flex-wrap items-center gap-3">
          <Button>ふつう</Button>
          <Button variant="accent" icon={<Sparkles size={16} />}>
            投稿する
          </Button>
          <Button variant="glass">ガラス</Button>
          <Button variant="danger">削除</Button>
          <Button loading>送信中</Button>
          <IconButton label="いいね" active={liked} onClick={() => setLiked(!liked)}>
            <Heart size={18} fill={liked ? "currentColor" : "none"} />
          </IconButton>
          <IconButton label="ブックマーク" active={saved} onClick={() => setSaved(!saved)}>
            <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
          </IconButton>
          <IconButton label="コメント">
            <MessageCircle size={18} />
          </IconButton>
        </Card>
      </section>

      <section>
        <SectionTitle>入力</SectionTitle>
        <Card className="flex flex-col gap-4">
          <TextField label="タイトル" placeholder="例：放課後の窓" counter="0 / 40" />
          <TextArea label="キャプション" placeholder="写真について一言" hint="#ハッシュタグ も使えます" />
          <TextField label="エラーの例" defaultValue="abc" error="8文字以上で入力してください" />
        </Card>
      </section>

      <section>
        <SectionTitle>面</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <Card className="text-sm">浮き出たカード</Card>
          <InsetPanel className="text-sm">くぼんだパネル</InsetPanel>
          <GlassPanel className="col-span-2 text-sm">
            すりガラスのパネル（背景の光がにじんで透けます）
          </GlassPanel>
        </div>
      </section>

      <section>
        <SectionTitle>アイコン・シート・通知</SectionTitle>
        <Card className="flex flex-wrap items-center gap-4">
          <Avatar name="ひとこま" size={48} ring />
          <Avatar name="Taro" size={40} />
          <Button onClick={() => setSheet(true)}>シートを開く</Button>
          <Button onClick={() => toast.success("保存しました")}>通知を出す</Button>
        </Card>
      </section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="すりガラスのシート">
        <p className="mb-4 text-sm text-ink-2">画面下からせり上がるモーダルです。背景をタップかEscキーで閉じます。</p>
        <Button variant="accent" className="w-full" onClick={() => setSheet(false)}>
          閉じる
        </Button>
      </Sheet>
    </div>
  );
}
