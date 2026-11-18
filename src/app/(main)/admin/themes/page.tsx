"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import type { ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import { CalendarClock, CircleStop, Pencil, Trash } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { ConfirmForm, StatusChip } from "@/components/admin/parts";
import { PoolAddForm, ThemeCreateForm, ThemeEditForm } from "@/components/admin/theme-forms";
import type { AdminThemes, PoolEntry } from "@/components/admin/types";
import { api, ApiError } from "@/lib/client/api";
import { TEMPLATES } from "@/lib/templates";
import { formatJstDateTime } from "@/lib/time";
import type { ThemeDTO } from "@/lib/types";

const SOURCE = { auto: "自動", admin: "管理者", debug: "デバッグ" } as const;

function ThemeRow({ t, actions }: { t: ThemeDTO; actions?: ReactNode }) {
  return (
    <div className="neu neu-sm flex flex-col gap-2 rounded-[18px] p-3" data-testid="admin-theme-row">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: t.accent }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">「{t.title}」</p>
          <p className="truncate text-xs text-ink-3">
            {formatJstDateTime(t.startsAt)} 〜 {formatJstDateTime(t.endsAt)}
          </p>
        </div>
        <StatusChip>{t.templateName}</StatusChip>
        <StatusChip tone={t.source === "auto" ? "neutral" : "accent"}>{SOURCE[t.source]}</StatusChip>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** お題の管理（任意のタイミング・内容でお題を出す、予約・終了・取り消し、自動出題の候補） */
function AdminThemesContent() {
  const { data, mutate } = useSWR<AdminThemes>("/api/admin/themes");
  const { data: pool, mutate: mutatePool } = useSWR<{ items: PoolEntry[] }>("/api/admin/theme-pool");
  const { mutate: globalMutate } = useSWRConfig();
  const [editing, setEditing] = useState<ThemeDTO | null>(null);
  const [ending, setEnding] = useState<ThemeDTO | null>(null);
  const [cancelling, setCancelling] = useState<ThemeDTO | null>(null);
  const [showPast, setShowPast] = useState(false);
  const toast = useToast();

  // お題が変わると、アプリ全体の「今日のお題」も変わる
  const refresh = () => {
    void mutate();
    void globalMutate("/api/themes/current");
  };

  async function togglePool(p: PoolEntry, enabled: boolean) {
    try {
      await api(`/api/admin/theme-pool/${p.id}`, { method: "PATCH", json: { enabled } });
      void mutatePool();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "変更できませんでした");
    }
  }

  if (!data) return <PageSpinner />;
  const current = data.current;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title="お題" subtitle="任意のタイミング・内容でお題を出せます" back="/admin" />

      <section>
        <SectionTitle>現在のお題</SectionTitle>
        <Card className="flex flex-col gap-3 p-4" data-testid="admin-current-theme">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: current.accent }}>
              <CalendarClock size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold text-ink" data-testid="admin-current-theme-title">
                「{current.title}」
              </p>
              <p className="truncate text-xs text-ink-3">
                {TEMPLATES[current.template].name} ・ {SOURCE[current.source]} ・ {formatJstDateTime(current.startsAt)} 〜 {formatJstDateTime(current.endsAt)}
              </p>
            </div>
          </div>
          {current.description && <p className="text-sm text-ink-2">{current.description}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(current)}>
              編集
            </Button>
            <Button size="sm" variant="danger" icon={<CircleStop size={14} />} onClick={() => setEnding(current)} data-testid="theme-end">
              今すぐ終了
            </Button>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>お題を出す</SectionTitle>
        <Card className="p-4">
          <ThemeCreateForm serverNow={data.serverNow} onCreated={refresh} />
        </Card>
      </section>

      <section>
        <SectionTitle>予約中のお題</SectionTitle>
        {data.upcoming.length === 0 ? (
          <p className="px-1 text-sm text-ink-3">予約中のお題はありません。</p>
        ) : (
          <div className="flex flex-col gap-2.5" data-testid="admin-upcoming-themes">
            {data.upcoming.map((t) => (
              <ThemeRow
                key={t.id}
                t={t}
                actions={
                  <>
                    <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(t)}>
                      編集
                    </Button>
                    <Button size="sm" variant="danger" icon={<Trash size={14} />} onClick={() => setCancelling(t)}>
                      取り消す
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>これまでのお題</SectionTitle>
        {showPast ? (
          <div className="flex flex-col gap-2.5">
            {data.past
              .filter((t) => t.id !== current.id)
              .map((t) => (
                <ThemeRow key={t.id} t={t} />
              ))}
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowPast(true)}>
            表示する（最近の{data.past.length}件）
          </Button>
        )}
      </section>

      <section>
        <SectionTitle>自動出題の候補</SectionTitle>
        <Card className="flex flex-col gap-1 p-4">
          <p className="mb-2 text-xs text-ink-3">毎朝5時、有効な候補の中から使われた回数の少ないものが選ばれます。</p>
          <details>
            <summary className="cursor-pointer text-sm font-bold text-ink-2">
              候補の一覧（{pool?.items.length ?? 0}件・うち有効 {pool?.items.filter((p) => p.enabled).length ?? 0}件）
            </summary>
            <div className="mt-2">
              {pool?.items.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-[var(--line)] py-1 last:border-b-0">
                  <span className="h-6 w-6 shrink-0 rounded-lg" style={{ background: p.accent }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Toggle
                      checked={p.enabled}
                      onChange={(v) => togglePool(p, v)}
                      label={`「${p.title}」`}
                      description={`${TEMPLATES[p.template].name} ・ ${p.timesUsed}回使用`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-accent">候補を追加する</summary>
            <div className="mt-4">
              <PoolAddForm onAdded={() => void mutatePool()} />
            </div>
          </details>
        </Card>
      </section>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="お題を編集">
        {editing && (
          <ThemeEditForm
            key={editing.id}
            theme={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!ending} onClose={() => setEnding(null)} title="お題を終了しますか？">
        {ending && (
          <ConfirmForm
            danger
            description={`「${ending.title}」を今すぐ終了します。予約中のお題がなければ、いつもの自動出題のお題（またはその日の臨時のお題）に切り替わります。`}
            confirmLabel="今すぐ終了する"
            onConfirm={() => api(`/api/admin/themes/${ending.id}`, { method: "POST", json: { action: "end" } })}
            onCancel={() => setEnding(null)}
            onDone={() => {
              toast.success("お題を終了しました");
              setEnding(null);
              refresh();
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!cancelling} onClose={() => setCancelling(null)} title="予約を取り消しますか？">
        {cancelling && (
          <ConfirmForm
            danger
            description={`「${cancelling.title}」（${formatJstDateTime(cancelling.startsAt)} 開始）の予約を取り消します。`}
            confirmLabel="取り消す"
            onConfirm={() => api(`/api/admin/themes/${cancelling.id}`, { method: "DELETE" })}
            onCancel={() => setCancelling(null)}
            onDone={() => {
              toast.success("予約を取り消しました");
              setCancelling(null);
              refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

export default function AdminThemesPage() {
  return (
    <AdminOnly>
      <AdminThemesContent />
    </AdminOnly>
  );
}
