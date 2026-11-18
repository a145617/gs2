"use client";

import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDayKey } from "@/lib/time";
import type { ThemeDTO } from "@/lib/types";

type Page = { items: ThemeDTO[]; nextCursor: string | null };

/** これまでのお題の一覧 */
export function ThemeArchive() {
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<Page>((index, prev) => {
    if (index === 0) return "/api/themes";
    if (!prev?.nextCursor) return null;
    return `/api/themes?before=${encodeURIComponent(prev.nextCursor)}`;
  });
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  return (
    <section>
      <SectionTitle>これまでのお題</SectionTitle>
      {isLoading ? (
        <div className="flex justify-center py-8 text-ink-3">
          <Spinner />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="theme-archive">
          {items.map((t) => (
            <li key={t.id}>
              <Link
                href={`/themes/${t.id}`}
                className="neu neu-sm neu-press flex items-center gap-4 rounded-[18px] px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-full"
                  style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${t.accent} 45%, white), ${t.accent})` }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-display truncate text-lg font-bold text-ink">{t.title}</span>
                  <span className="text-xs text-ink-3">
                    {formatDayKey(t.dayKey)} ・ {t.templateName}
                    {t.isCurrent && <span className="ml-2 font-bold text-accent">開催中</span>}
                    {t.source !== "auto" && <span className="ml-2">（{t.source === "admin" ? "管理者" : "デバッグ"}）</span>}
                  </span>
                </span>
                <ChevronRight size={18} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button size="sm" loading={isValidating} onClick={() => setSize(size + 1)}>
            もっと見る
          </Button>
        </div>
      )}
    </section>
  );
}
