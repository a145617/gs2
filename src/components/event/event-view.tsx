"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Camera, Clock, PartyPopper, Users } from "lucide-react";
import { Mosaic } from "./mosaic";
import { Countdown } from "@/components/theme/countdown";
import { LinkButton } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { PostGrid } from "@/components/post/post-grid";
import { PostAuthorRow } from "@/components/post/post-parts";
import { useServerSkew } from "@/lib/client/theme";
import { formatJstDateTime } from "@/lib/time";
import type { EventCellDTO, EventDetailResponse, PostDTO } from "@/lib/types";

const STATUS_LABEL = { upcoming: "開催前", active: "開催中", completed: "完成！", ended: "終了" } as const;

export function ColorSwatch({ hex, size = 56 }: { hex: string; size?: number }) {
  return (
    <span className="neu neu-sm inline-flex shrink-0 items-center justify-center rounded-full p-1.5" style={{ width: size, height: size }}>
      <span
        className="block h-full w-full rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${hex} 55%, white), ${hex} 70%)` }}
      />
    </span>
  );
}

function CellPostSheet({ cell, onClose }: { cell: EventCellDTO | null; onClose: () => void }) {
  const { data } = useSWR<{ post: PostDTO }>(cell?.postId ? `/api/posts/${cell.postId}` : null);
  return (
    <Sheet open={!!cell} onClose={onClose} title={cell?.postId ? "このマスの写真" : "まだ空いているマス"}>
      {cell && !cell.postId && <p className="text-sm text-ink-2">この色の写真を投稿すると、どこかの空いているマスが埋まります。</p>}
      {cell?.postId && !data && <PageSpinner />}
      {data?.post && (
        <div className="flex flex-col gap-3">
          <PostAuthorRow post={data.post} />
          {data.post.image && (
            // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像
            <img src={data.post.image.md} alt={data.post.title} className="w-full rounded-2xl" />
          )}
          <p className="font-display text-lg font-bold text-ink">{data.post.title}</p>
          <LinkButton href={`/p/${data.post.id}`} size="sm">
            投稿を開く
          </LinkButton>
        </div>
      )}
    </Sheet>
  );
}

/** イベントの画面（ピクセルアート・担当色・進み具合） */
export function EventView({ eventId, showCamera = true }: { eventId: string; showCamera?: boolean }) {
  const { data, error } = useSWR<EventDetailResponse>(`/api/events/${eventId}`, { refreshInterval: 20_000 });
  const skew = useServerSkew(data?.serverNow);
  const [tapped, setTapped] = useState<EventCellDTO | null>(null);
  if (error) return <p className="text-sm text-danger">イベントを読み込めませんでした</p>;
  if (!data) return <PageSpinner label="ピクセルアートを読み込み中…" />;
  const { event, cells, myColor } = data;
  const pct = event.totalCells ? Math.round((event.filledCells / event.totalCells) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 animate-fade-up" data-testid="event-view">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="neu-inset neu-sm rounded-full px-3 py-1 text-xs font-bold text-accent" data-testid="event-status">
            {STATUS_LABEL[event.status]}
          </span>
          {event.status === "active" && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-2">
              <Clock size={13} /> 残り <Countdown target={event.endsAt} skew={skew} className="font-bold tabular-nums text-ink" />
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{event.title}</h1>
        {event.description && <p className="text-sm text-ink-2">{event.description}</p>}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-ink-2">
            <span>
              <span className="font-bold text-ink tabular-nums" data-testid="event-progress">
                {event.filledCells} / {event.totalCells}
              </span>{" "}
              マス（{pct}%）
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {event.participants}人が参加
            </span>
          </div>
          <div className="neu-inset neu-sm h-3 overflow-hidden rounded-full">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="text-[11px] text-ink-3">
          {formatJstDateTime(event.startsAt)} 〜 {formatJstDateTime(event.endsAt)}
        </p>
      </Card>

      {event.status === "completed" && (
        <div className="glass glass-sheen flex items-center gap-3 rounded-[22px] px-5 py-4" data-testid="event-completed">
          <PartyPopper className="text-accent" />
          <p className="text-sm text-ink">みんなの写真で、絵が完成しました！ご協力ありがとうございました。</p>
        </div>
      )}

      {myColor && (
        <section className="glass glass-sheen flex items-center gap-4 rounded-[24px] p-4" data-testid="my-color">
          <ColorSwatch hex={myColor.hex} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-3">あなたの色</p>
            <p className="font-display text-xl font-bold" style={{ color: `color-mix(in oklab, ${myColor.hex} 80%, var(--text))` }}>
              {myColor.name}
            </p>
            <p className="text-xs text-ink-2">
              画面の{Math.round(event.threshold * 100)}%以上がこの色の写真を撮ろう ・ あなたの写真 {myColor.myPosts}枚
            </p>
          </div>
          {showCamera && event.status === "active" && (
            <LinkButton href="/event/camera" variant="accent" size="sm" icon={<Camera size={15} />}>
              撮る
            </LinkButton>
          )}
        </section>
      )}

      <Mosaic event={event} cells={cells} highlightColor={myColor?.index ?? null} onCellTap={(c) => setTapped(c)} />
      <p className="-mt-3 text-center text-[11px] text-ink-3">マスをタップすると写真が見られます ・ ダブルタップ・つまんで拡大</p>

      <section>
        <SectionTitle>色ごとの進み具合</SectionTitle>
        <ul className="grid grid-cols-2 gap-2.5">
          {event.palette.map((c) => (
            <li key={c.index} className="neu neu-sm flex items-center gap-2.5 rounded-2xl px-3 py-2">
              <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: c.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-ink">{c.name}</span>
                <span className="block text-[10px] text-ink-3 tabular-nums">
                  {c.filled} / {c.total}
                </span>
              </span>
              {myColor?.index === c.index && <span className="text-[10px] font-bold text-accent">担当</span>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>集まった写真</SectionTitle>
        <PostGrid endpoint={`/api/events/${event.id}/posts`} emptyText="まだ写真はありません" />
      </section>
      <CellPostSheet cell={tapped} onClose={() => setTapped(null)} />
      <p className="text-center text-xs text-ink-3">
        <Link href="/event" className="text-accent">
          イベントのトップへ
        </Link>
      </p>
    </div>
  );
}
