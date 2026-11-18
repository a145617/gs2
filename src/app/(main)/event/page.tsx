"use client";

import Link from "next/link";
import useSWR from "swr";
import { CalendarClock, ChevronRight, Palette } from "lucide-react";
import { EventView } from "@/components/event/event-view";
import { PageHeader } from "@/components/shell/page-header";
import { Card, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { formatJstDateTime } from "@/lib/time";
import type { CurrentEventResponse, EventDTO } from "@/lib/types";

function PastEvents({ excludeId }: { excludeId?: string }) {
  const { data } = useSWR<{ items: EventDTO[] }>("/api/events");
  const items = (data?.items ?? []).filter((e) => e.id !== excludeId);
  if (items.length === 0) return null;
  return (
    <section>
      <SectionTitle>これまでのイベント</SectionTitle>
      <ul className="flex flex-col gap-3">
        {items.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="neu neu-sm neu-press flex items-center gap-3 rounded-[18px] px-4 py-3">
              <span className="flex -space-x-1.5" aria-hidden="true">
                {e.palette.slice(0, 4).map((c) => (
                  <span key={c.index} className="h-5 w-5 rounded-full ring-2 ring-[var(--bg)]" style={{ background: c.hex }} />
                ))}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display truncate font-bold text-ink">{e.title}</span>
                <span className="text-xs text-ink-3">
                  {formatJstDateTime(e.startsAt)} ・ {e.filledCells}/{e.totalCells}マス{e.completedAt ? " ・ 完成" : ""}
                </span>
              </span>
              <ChevronRight size={18} className="text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** イベント（開催中のものを表示。無ければ次の予定とこれまでのイベント） */
export default function EventPage() {
  const { data, error } = useSWR<CurrentEventResponse>("/api/events/current");
  if (error) return <EmptyState title="イベントを読み込めませんでした" />;
  if (!data) return <PageSpinner />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="イベント" subtitle="色を集めて、みんなで1枚の絵を完成させよう" back={false} />
      {data.event ? (
        <EventView eventId={data.event.id} />
      ) : (
        <Card className="flex flex-col items-center gap-3 py-8 text-center" data-testid="no-event">
          <Palette size={28} className="text-accent" />
          <p className="font-bold text-ink">いまは開催中のイベントはありません</p>
          <p className="text-sm text-ink-2">イベントは1週間に1度ほど、不定期に始まります。始まったらお知らせでお届けします。</p>
          {data.upcoming && (
            <p className="inline-flex items-center gap-1 text-xs text-ink-3">
              <CalendarClock size={13} /> 次のイベント「{data.upcoming.title}」: {formatJstDateTime(data.upcoming.startsAt)}〜
            </p>
          )}
        </Card>
      )}
      <PastEvents excludeId={data.event?.id} />
    </div>
  );
}
