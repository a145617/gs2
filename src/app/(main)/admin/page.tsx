"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import Link from "next/link";
import useSWR from "swr";
import clsx from "clsx";
import { CalendarClock, ChevronRight, Palette } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, SectionTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/admin/parts";
import type { AdminStats } from "@/components/admin/types";
import { formatJstDateTime } from "@/lib/time";
import type { CurrentEventResponse, CurrentThemeResponse } from "@/lib/types";

function Stat({ href, label, value, alert, testId }: { href: string; label: string; value: number | undefined; alert?: boolean; testId?: string }) {
  return (
    <Link href={href} className="neu neu-sm neu-press flex flex-col gap-1 rounded-[20px] px-4 py-3" data-testid={testId}>
      <span className="text-xs text-ink-3">{label}</span>
      <span className={clsx("font-display text-2xl font-bold tabular-nums", alert ? "text-danger" : "text-ink")}>{value ?? "–"}</span>
    </Link>
  );
}

const EVENT_STATUS = { upcoming: "予定", active: "開催中", completed: "完成", ended: "終了" } as const;

/** 管理画面のトップ（件数と、開催中のお題・イベント） */
function AdminHomeContent() {
  const { data: stats } = useSWR<AdminStats>("/api/admin/stats");
  const { data: theme } = useSWR<CurrentThemeResponse>("/api/themes/current");
  const { data: ev } = useSWR<CurrentEventResponse>("/api/events/current");
  const event = ev?.event ?? ev?.upcoming ?? null;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title="管理画面" subtitle="投稿・アカウントの管理と、お題・イベントの開催" back="/" />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="件数">
        <Stat href="/admin/reports" label="未対応の通報" value={stats?.openReports} alert={!!stats?.openReports} testId="stat-open-reports" />
        <Stat href="/admin/posts" label="非表示の投稿" value={stats?.hiddenPosts} />
        <Stat href="/admin/users" label="アカウント" value={stats?.users} />
        <Stat href="/admin/posts" label="投稿" value={stats?.posts} />
        <Stat href="/admin/comments" label="コメント" value={stats?.comments} />
      </section>

      <section>
        <SectionTitle>今日のお題</SectionTitle>
        <Link href="/admin/themes" className="block">
          <Card className="neu-press flex items-center gap-4 p-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{ background: theme?.theme.accent ?? "var(--accent)" }}
            >
              <CalendarClock size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-bold text-ink">{theme ? `「${theme.theme.title}」` : "…"}</span>
              {theme && (
                <span className="block truncate text-xs text-ink-3">
                  {theme.theme.templateName} ・ {formatJstDateTime(theme.theme.startsAt)} 〜 {formatJstDateTime(theme.theme.endsAt)} ・ 投稿 {theme.postCount}
                </span>
              )}
            </span>
            <span className="flex items-center text-sm text-accent">
              お題を出す
              <ChevronRight size={16} />
            </span>
          </Card>
        </Link>
      </section>

      <section>
        <SectionTitle>イベント</SectionTitle>
        <Link href="/admin/events" className="block">
          <Card className="neu-press flex items-center gap-4 p-4">
            <span className="neu-inset neu-sm flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-accent">
              <Palette size={22} />
            </span>
            <span className="min-w-0 flex-1">
              {event ? (
                <>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-lg font-bold text-ink">{event.title}</span>
                    <StatusChip tone={event.status === "active" ? "accent" : "neutral"}>{EVENT_STATUS[event.status]}</StatusChip>
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {formatJstDateTime(event.startsAt)} 〜 {formatJstDateTime(event.endsAt)} ・ {event.filledCells}/{event.totalCells}マス
                  </span>
                </>
              ) : (
                <span className="text-sm text-ink-2">開催中・予定のイベントはありません</span>
              )}
            </span>
            <span className="flex items-center text-sm text-accent">
              開催する
              <ChevronRight size={16} />
            </span>
          </Card>
        </Link>
      </section>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <AdminOnly>
      <AdminHomeContent />
    </AdminOnly>
  );
}
