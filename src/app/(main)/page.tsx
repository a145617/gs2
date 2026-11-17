"use client";

import { TodayThemeCard } from "@/components/theme/today-theme-card";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { useCurrentTheme } from "@/lib/client/theme";

export default function HomePage() {
  const { data, error, skew } = useCurrentTheme();
  if (error) return <EmptyState title="お題を読み込めませんでした">通信状態を確認してください。</EmptyState>;
  if (!data) return <PageSpinner label="今日のお題を読み込み中…" />;
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <TodayThemeCard theme={data.theme} nextChangeAt={data.nextChangeAt} skew={skew} />
    </div>
  );
}
