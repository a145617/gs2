"use client";

import type { ReactNode } from "react";
import { Camera, Clock } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Countdown } from "./countdown";
import { formatDayKey } from "@/lib/time";
import type { ThemeDTO } from "@/lib/types";

/** 今日のお題のカード（ニューモーフィズムの台にすりガラスの面を重ねる） */
export function TodayThemeCard({
  theme,
  nextChangeAt,
  skew,
  action,
  footer,
}: {
  theme: ThemeDTO;
  nextChangeAt: string;
  skew: number;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      aria-label="今日のお題"
      className="neu neu-lg relative overflow-hidden rounded-[30px] p-2"
      data-testid="today-theme"
    >
      {/* お題の色の光 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full opacity-60 blur-3xl"
        style={{ background: theme.accent }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full opacity-35 blur-3xl"
        style={{ background: `color-mix(in oklab, ${theme.accent} 60%, #ffd6f0)` }}
      />
      <div className="glass glass-sheen relative flex flex-col gap-4 rounded-[24px] px-5 pt-5 pb-5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold tracking-wider text-ink-2">{formatDayKey(theme.dayKey)}のお題</span>
          <span className="neu-inset neu-sm rounded-full px-3 py-1 font-medium text-ink-2">
            表示: {theme.templateName}
          </span>
        </div>
        <div className="flex flex-col gap-2 py-2">
          <h2
            className="font-display text-[44px] leading-tight font-bold break-words"
            style={{ color: `color-mix(in oklab, ${theme.accent} 78%, var(--text))` }}
            data-testid="theme-title"
          >
            {theme.title}
          </h2>
          {theme.description && <p className="font-display text-[15px] text-ink-2">{theme.description}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
            <Clock size={15} />
            次のお題まで
            <Countdown target={nextChangeAt} skew={skew} className="font-bold tabular-nums text-ink" />
          </p>
          {action ?? (
            <LinkButton href="/camera" variant="accent" icon={<Camera size={17} />}>
              このお題で撮る
            </LinkButton>
          )}
        </div>
        {footer}
      </div>
    </section>
  );
}
