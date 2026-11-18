"use client";

import useSWRInfinite from "swr/infinite";
import type { AdminPage } from "./types";

/** 管理画面の一覧（「もっと見る」で続きを読み込む） */
export function useAdminList<T>(base: string | null) {
  const swr = useSWRInfinite<AdminPage<T>>(
    (i, prev) => {
      if (!base) return null;
      if (i === 0) return base;
      if (!prev?.nextCursor) return null;
      return `${base}${base.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(prev.nextCursor)}`;
    },
    { revalidateFirstPage: true },
  );
  const items = swr.data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!swr.data?.[swr.data.length - 1]?.nextCursor;
  return {
    items,
    hasMore,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    loadMore: () => swr.setSize(swr.size + 1),
    reload: () => swr.mutate(),
  };
}
