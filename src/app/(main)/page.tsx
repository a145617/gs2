"use client";

import { Camera, CircleCheck } from "lucide-react";
import { TodayThemeCard } from "@/components/theme/today-theme-card";
import { Feed } from "@/components/feed/feed";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { useCurrentTheme } from "@/lib/client/theme";
import { useMe } from "@/lib/client/session";
import { useFeedDebug } from "@/lib/client/debug-flags";

export default function HomePage() {
  const { data, error, skew } = useCurrentTheme();
  const { debugMode } = useMe();
  const feedDebug = useFeedDebug();
  if (error) return <EmptyState title="お題を読み込めませんでした">通信状態を確認してください。</EmptyState>;
  if (!data) return <PageSpinner label="今日のお題を読み込み中…" />;
  const posted = data.myPostCount > 0;
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <TodayThemeCard
        theme={data.theme}
        nextChangeAt={data.nextChangeAt}
        skew={skew}
        action={
          posted ? (
            <LinkButton href="/camera" icon={<Camera size={16} />} size="sm">
              もう1枚撮る
            </LinkButton>
          ) : undefined
        }
        footer={
          <p className="flex items-center gap-1.5 text-xs text-ink-2" data-testid="theme-status">
            {posted ? (
              <>
                <CircleCheck size={14} className="text-ok" />
                投稿済み（{data.myPostCount}枚）・ みんなの投稿 {data.postCount}件
              </>
            ) : (
              <>みんなの投稿 {data.postCount}件 ・ 投稿すると見られるようになります</>
            )}
          </p>
        }
      />
      <Feed key={`${data.theme.id}-${posted}`} debug={debugMode && feedDebug} />
    </div>
  );
}
