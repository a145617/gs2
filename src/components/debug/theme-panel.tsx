"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, TextField } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "@/lib/templates";
import { formatJstDateTime } from "@/lib/time";
import { THEME_LIMITS } from "@/lib/validation";
import type { ThemeDTO } from "@/lib/types";
import { InfoRow, Panel, useDebugAction, type DebugStatus } from "./shared";

const SOURCE = { auto: "毎朝の自動出題", admin: "管理者", debug: "デバッグ" } as const;

/** お題（任意のタイミング・内容で始める／終わらせる） */
export function ThemePanel({ status }: { status: DebugStatus }) {
  const { busy, run } = useDebugAction();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("window");
  const t = status.theme;

  return (
    <Panel
      id="theme"
      icon={<CalendarClock size={20} />}
      title="お題"
      description="任意のタイミング・内容でお題を始められます。表示テンプレートを選ぶと、投稿の見せ方（窓・額縁・水面など12種類）を確認できます。"
    >
      <div>
        <InfoRow label="今のお題" testId="debug-theme-title">
          「{t.title}」
        </InfoRow>
        <InfoRow label="表示テンプレート">{t.templateName}</InfoRow>
        <InfoRow label="出題">{SOURCE[t.source]}</InfoRow>
        <InfoRow label="期間">
          {formatJstDateTime(t.startsAt)} 〜 {formatJstDateTime(t.endsAt)}
        </InfoRow>
      </div>
      <div className="flex flex-col gap-3">
        <TextField
          label="お題（空欄ならお題の候補からランダム）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={THEME_LIMITS.title}
          placeholder="例: ひかり"
          data-testid="debug-theme-input"
        />
        <Select
          label="表示テンプレート"
          value={template}
          onChange={(e) => setTemplate(e.target.value as TemplateKey)}
          hint={TEMPLATES[template].description}
          data-testid="debug-theme-template"
        >
          {TEMPLATE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TEMPLATES[k].name}
            </option>
          ))}
        </Select>
        <Button
          variant="accent"
          loading={busy === "start"}
          onClick={() =>
            run(
              "start",
              () =>
                api<{ theme: ThemeDTO }>("/api/debug/themes", {
                  method: "POST",
                  json: title.trim() ? { title, template } : { template },
                }),
              (r) => `お題「${r.theme.title}」（${r.theme.templateName}）を開始しました`,
            )
          }
          data-testid="debug-theme-start"
        >
          このお題を今すぐ開始
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            loading={busy === "random"}
            onClick={() =>
              run(
                "random",
                () => api<{ theme: ThemeDTO }>("/api/debug/themes", { method: "POST", json: {} }),
                (r) => `ランダムなお題「${r.theme.title}」を開始しました`,
              )
            }
          >
            ランダムに開始
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={busy === "end"}
            onClick={() =>
              run(
                "end",
                () => api<{ theme: ThemeDTO }>("/api/debug/themes", { method: "DELETE" }),
                (r) => `お題を終了しました。今のお題は「${r.theme.title}」です`,
              )
            }
            data-testid="debug-theme-end"
          >
            今のお題を終了
          </Button>
        </div>
      </div>
      <p className="text-xs text-ink-3">
        <Link href="/design/templates" className="text-accent">
          12種類の表示テンプレートを一覧で見る
        </Link>
        ・ 管理者による出題は
        <Link href="/admin/themes" className="ml-1 text-accent">
          管理画面
        </Link>
      </p>
    </Panel>
  );
}
