"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { formatDayKey, formatJstDateTime } from "@/lib/time";
import type { ApiError } from "@/lib/client/api";
import type { ThemeDTO } from "@/lib/types";

/** お題ごとのページ（そのお題の投稿一覧は投稿機能で追加） */
export default function ThemePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<{ theme: ThemeDTO }, ApiError>(`/api/themes/${id}`);
  if (isLoading) return <PageSpinner />;
  if (error || !data) return <EmptyState title="お題が見つかりませんでした" />;
  const t = data.theme;
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title={`「${t.title}」`} subtitle={`${formatDayKey(t.dayKey)}のお題`} />
      <Card className="flex flex-col gap-2">
        <p className="font-display text-3xl font-bold" style={{ color: `color-mix(in oklab, ${t.accent} 78%, var(--text))` }}>
          {t.title}
        </p>
        {t.description && <p className="font-display text-ink-2">{t.description}</p>}
        <p className="text-xs text-ink-3">
          表示テンプレート: {t.templateName} ・ {formatJstDateTime(t.startsAt)} 〜 {formatJstDateTime(t.endsAt)}
        </p>
      </Card>
    </div>
  );
}
