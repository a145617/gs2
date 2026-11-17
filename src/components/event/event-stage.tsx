"use client";

import Link from "next/link";
import { Palette } from "lucide-react";

/** イベントの投稿の表示（担当した色の額と、イベント名） */
export function EventStage({
  src,
  width,
  height,
  title,
  event,
}: {
  src: string;
  width: number;
  height: number;
  title: string;
  event: { id: string; title: string; colorHex: string; colorName: string };
}) {
  const r = Math.min(1.9, Math.max(0.66, width / height));
  return (
    <figure className="flex flex-col gap-2" data-testid="event-stage">
      <div
        className="rounded-[22px] p-2.5"
        style={{
          background: `repeating-conic-gradient(${event.colorHex} 0 25%, color-mix(in oklab, ${event.colorHex} 70%, white) 0 50%) 0 0 / 14px 14px`,
          boxShadow: "7px 7px 16px var(--sh-dark), -7px -7px 16px var(--sh-light)",
        }}
      >
        <div className="relative overflow-hidden rounded-[14px]" style={{ aspectRatio: String(r) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像 */}
          <img src={src} alt={title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
      <figcaption className="flex items-center justify-center gap-1.5 text-[11px] text-ink-3">
        <Palette size={12} />
        <Link href={`/events/${event.id}`} className="text-accent">
          イベント「{event.title}」
        </Link>
        の「{event.colorName}」の1ピクセル
      </figcaption>
    </figure>
  );
}
