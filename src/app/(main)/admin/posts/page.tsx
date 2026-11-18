"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { PageSpinner } from "@/components/ui/spinner";
import { AdminSearch, MoreButton, StatusChip } from "@/components/admin/parts";
import { PostAdminSheet } from "@/components/admin/post-admin-sheet";
import { useAdminList } from "@/components/admin/use-admin-list";
import type { AdminPost } from "@/components/admin/types";
import { formatRelative } from "@/lib/time";

type Filter = "all" | "reported" | "hidden";

/** すべての投稿の一覧（検索・絞り込み）と、編集・非表示・削除 */
function AdminPostsContent() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("status", filter);
  const list = useAdminList<AdminPost>(`/api/admin/posts${params.size ? `?${params}` : ""}`);
  const { mutate } = useSWRConfig();

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="投稿" subtitle="すべての投稿を編集・非表示・削除できます" back="/admin" />
      <AdminSearch placeholder="タイトル・キャプション・ハッシュタグで検索" onSearch={setQ} />
      <Segmented
        ariaLabel="投稿の絞り込み"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "すべて" },
          { value: "reported", label: "通報あり" },
          { value: "hidden", label: "非表示" },
        ]}
      />
      {list.isLoading ? (
        <PageSpinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={<LayoutGrid size={24} />} title="該当する投稿はありません" />
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="admin-posts">
          {list.items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p.id)}
                className="neu neu-sm neu-press flex w-full items-center gap-3 rounded-[18px] p-2.5 text-left"
                data-testid="admin-post-row"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する縮小画像 */}
                <img src={p.thumb ?? ""} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-ink">{p.title}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {p.author.displayName} @{p.author.handle} ・ {formatRelative(p.createdAt)} ・ いいね {p.likeCount} ・ コメント {p.commentCount}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {p.kind === "event" && <StatusChip tone="accent">イベント</StatusChip>}
                    {p.status === "hidden" && <StatusChip tone="warn">非表示</StatusChip>}
                    {p.reportCount > 0 && <StatusChip tone="danger">通報 {p.reportCount}</StatusChip>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MoreButton hasMore={list.hasMore} loading={list.isValidating} onClick={list.loadMore} />
      <PostAdminSheet
        postId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          list.reload();
          void mutate("/api/admin/stats");
        }}
      />
    </div>
  );
}

export default function AdminPostsPage() {
  return (
    <AdminOnly>
      <AdminPostsContent />
    </AdminOnly>
  );
}
