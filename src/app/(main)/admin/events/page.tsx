"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { CircleStop, ExternalLink, Pencil, Trash } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { ConfirmForm, StatusChip } from "@/components/admin/parts";
import { EventCreateForm, EventEditForm } from "@/components/admin/event-forms";
import type { AdminEvents } from "@/components/admin/types";
import { api, ApiError } from "@/lib/client/api";
import { formatJstDateTime, fromJstInputValue, toJstInputValue } from "@/lib/time";
import type { EventDTO } from "@/lib/types";

const STATUS = { upcoming: "予定", active: "開催中", completed: "完成", ended: "終了" } as const;
const SOURCE = { auto: "自動", admin: "管理者", debug: "デバッグ" } as const;

function EventCard({ ev, onEdit, onEnd, onCancel }: { ev: EventDTO; onEdit: () => void; onEnd: () => void; onCancel: () => void }) {
  const pct = ev.totalCells > 0 ? Math.round((ev.filledCells / ev.totalCells) * 100) : 0;
  const running = ev.status === "active" || ev.status === "completed";
  return (
    <div className="neu neu-sm flex flex-col gap-3 rounded-[20px] p-4" data-testid="admin-event-row">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-bold text-ink">{ev.title}</p>
        <StatusChip tone={ev.status === "active" ? "accent" : ev.status === "completed" ? "ok" : "neutral"}>{STATUS[ev.status]}</StatusChip>
        <StatusChip>{SOURCE[ev.source]}</StatusChip>
      </div>
      <p className="text-xs text-ink-3">
        {formatJstDateTime(ev.startsAt)} 〜 {formatJstDateTime(ev.endsAt)} ・ {ev.gridW}×{ev.gridH}マス ・ 参加 {ev.participants}人
      </p>
      <div className="flex items-center gap-3">
        <div className="neu-inset neu-sm h-2.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-ink-2 tabular-nums">
          {ev.filledCells}/{ev.totalCells}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {ev.palette.map((c) => (
          <li key={c.index} className="flex items-center gap-1 text-[11px] text-ink-3">
            <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} aria-hidden="true" />
            {c.name} {c.filled}/{c.total}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {ev.status !== "upcoming" && (
          <Link href={`/events/${ev.id}`} className="neu neu-sm neu-convex neu-press inline-flex h-9 items-center gap-1.5 rounded-[12px] px-3.5 text-sm text-ink">
            <ExternalLink size={14} />
            見る
          </Link>
        )}
        {ev.status !== "ended" && (
          <Button size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
            変更
          </Button>
        )}
        {running && (
          <Button size="sm" variant="danger" icon={<CircleStop size={14} />} onClick={onEnd} data-testid="event-end">
            今すぐ終了
          </Button>
        )}
        {ev.status === "upcoming" && (
          <Button size="sm" variant="danger" icon={<Trash size={14} />} onClick={onCancel} data-testid="event-cancel">
            取り消す
          </Button>
        )}
      </div>
    </div>
  );
}

function AutoSchedule({ data, onChanged }: { data: AdminEvents; onChanged: () => void }) {
  const [next, setNext] = useState(data.auto.nextAutoAt ? toJstInputValue(data.auto.nextAutoAt) : "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save(patch: { eventAutoEnabled?: boolean; eventNextAutoAt?: string | null }, message: string) {
    setBusy(true);
    try {
      await api("/api/admin/settings", { method: "PATCH", json: patch });
      toast.success(message);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Toggle
        checked={data.auto.enabled}
        disabled={busy}
        onChange={(v) => save({ eventAutoEnabled: v }, v ? "自動開催をオンにしました" : "自動開催をオフにしました")}
        label="イベントを自動で開催する"
        description="1週間に1度ほど、不定期に用意された絵のイベントが始まります"
      />
      {data.auto.enabled && (
        <>
          <p className="text-sm text-ink-2">
            次の自動開催: <strong>{data.auto.nextAutoAt ? formatJstDateTime(data.auto.nextAutoAt, true) : "まだ決まっていません"}</strong>
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField type="datetime-local" label="日時を変更（日本時間）" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <Button
              disabled={busy || !fromJstInputValue(next)}
              onClick={() => save({ eventNextAutoAt: fromJstInputValue(next) }, "次の自動開催の日時を変更しました")}
            >
              変更
            </Button>
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ eventNextAutoAt: null }, "次の自動開催の日時を決め直します")}>
            日時を自動で決め直す
          </Button>
        </>
      )}
    </Card>
  );
}

/** イベントの管理（任意の絵・タイミングで開催、予約・終了・取り消し、自動開催の設定） */
function AdminEventsContent() {
  const { data, mutate } = useSWR<AdminEvents>("/api/admin/events");
  const { mutate: globalMutate } = useSWRConfig();
  const [editing, setEditing] = useState<EventDTO | null>(null);
  const [ending, setEnding] = useState<EventDTO | null>(null);
  const [cancelling, setCancelling] = useState<EventDTO | null>(null);
  const toast = useToast();

  const refresh = () => {
    void mutate();
    void globalMutate("/api/events/current");
  };

  if (!data) return <PageSpinner />;
  const live = data.items.filter((e) => e.status === "active" || e.status === "completed" || e.status === "upcoming");
  const past = data.items.filter((e) => e.status === "ended");

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title="イベント" subtitle="みんなで1枚のピクセルアートを完成させる" back="/admin" />

      <section>
        <SectionTitle>開催中・予定</SectionTitle>
        {live.length === 0 ? (
          <p className="px-1 text-sm text-ink-3">開催中・予定のイベントはありません。</p>
        ) : (
          <div className="flex flex-col gap-3" data-testid="admin-live-events">
            {live.map((ev) => (
              <EventCard key={ev.id} ev={ev} onEdit={() => setEditing(ev)} onEnd={() => setEnding(ev)} onCancel={() => setCancelling(ev)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>イベントを開催する</SectionTitle>
        <Card className="p-4">
          <EventCreateForm serverNow={data.serverNow} onCreated={refresh} />
        </Card>
      </section>

      <section>
        <SectionTitle>自動開催</SectionTitle>
        <AutoSchedule key={`${data.auto.enabled}-${data.auto.nextAutoAt}`} data={data} onChanged={refresh} />
      </section>

      {past.length > 0 && (
        <section>
          <SectionTitle>終了したイベント</SectionTitle>
          <details>
            <summary className="cursor-pointer px-1 text-sm font-bold text-ink-2">表示する（最近の{past.length}件）</summary>
            <div className="mt-3 flex flex-col gap-3">
              {past.map((ev) => (
                <EventCard key={ev.id} ev={ev} onEdit={() => setEditing(ev)} onEnd={() => {}} onCancel={() => {}} />
              ))}
            </div>
          </details>
        </section>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="イベントを変更">
        {editing && (
          <EventEditForm
            key={editing.id}
            event={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!ending} onClose={() => setEnding(null)} title="イベントを終了しますか？">
        {ending && (
          <ConfirmForm
            danger
            description={`「${ending.title}」を今すぐ終了します。完成していないマスは埋められなくなります。`}
            confirmLabel="今すぐ終了する"
            onConfirm={() => api(`/api/admin/events/${ending.id}`, { method: "POST", json: { action: "end" } })}
            onCancel={() => setEnding(null)}
            onDone={() => {
              toast.success("イベントを終了しました");
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
            onConfirm={() => api(`/api/admin/events/${cancelling.id}`, { method: "DELETE" })}
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

export default function AdminEventsPage() {
  return (
    <AdminOnly>
      <AdminEventsContent />
    </AdminOnly>
  );
}
