"use client";

import useSWRInfinite from "swr/infinite";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { PostThumb } from "./post-parts";
import type { PostPage } from "@/lib/types";

/** 投稿の一覧（3列のグリッド、もっと見る付き） */
export function PostGrid({ endpoint, emptyText = "まだ投稿がありません" }: { endpoint: string; emptyText?: string }) {
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<PostPage>((i, prev) => {
    if (i === 0) return endpoint;
    if (!prev?.nextCursor) return null;
    return `${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(prev.nextCursor)}`;
  });
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10 text-ink-3">
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) return <EmptyState icon={<ImageUp size={24} />} title={emptyText} />;
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-2.5" data-testid="post-grid">
        {items.map((p) => (
          <li key={p.id}>
            <PostThumb post={p} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <Button size="sm" loading={isValidating} onClick={() => setSize(size + 1)}>
            もっと見る
          </Button>
        </div>
      )}
    </div>
  );
}
