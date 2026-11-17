"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { RefreshCw, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { PostCard } from "@/components/post/post-card";
import type { FeedPage } from "@/lib/types";

function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * ホームのフィード（スクロールで続きを読み込む）。
 * 上部にフォロー中の人の投稿、その後に人気・好みに合わせたおすすめをランダムに並べる。
 */
export function Feed({ debug = false }: { debug?: boolean }) {
  // 並び順の種。「新しい並びで見る」で作り直す
  const [seed, setSeed] = useState(newSeed);
  const sentinel = useRef<HTMLDivElement>(null);
  const { data, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<FeedPage>(
    (i, prev) => {
      if (i > 0 && !prev?.nextCursor) return null;
      const cursor = i === 0 ? "0" : prev!.nextCursor!;
      return `/api/feed?seed=${seed}&cursor=${cursor}${debug ? "&debug=1" : ""}`;
    },
    { revalidateFirstPage: false, revalidateOnFocus: false },
  );
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;
  const loadingMore = isValidating && size > (data?.length ?? 0);

  // 一番下が見えたら続きを読み込む
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isValidating) void setSize((s) => s + 1);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isValidating, setSize]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10 text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={<Sparkles size={24} />} title="まだ投稿がありません">今日のお題で、最初の一枚を撮ってみましょう。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="feed">
      {items.map((p, i) => {
        const prev = items[i - 1];
        const header =
          i === 0 || prev?.feedSection !== p.feedSection ? (
            <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-bold tracking-wider text-ink-3" data-testid={`feed-section-${p.feedSection}`}>
              {p.feedSection === "following" ? (
                <>
                  <Users size={14} /> フォロー中の人の投稿
                </>
              ) : (
                <>
                  <Sparkles size={14} /> おすすめ
                </>
              )}
            </h2>
          ) : null;
        return (
          <Fragment key={p.id}>
            {header}
            <PostCard post={p} showDebug={debug} />
          </Fragment>
        );
      })}
      <div ref={sentinel} aria-hidden="true" />
      {loadingMore && (
        <div className="flex justify-center py-4 text-ink-3">
          <Spinner />
        </div>
      )}
      {!hasMore && (
        <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-ink-3">
          <p>すべての投稿を表示しました</p>
          <Button
            size="sm"
            icon={<RefreshCw size={15} />}
            onClick={() => {
              setSeed(newSeed());
              void mutate();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            新しい並びで見る
          </Button>
        </div>
      )}
    </div>
  );
}
