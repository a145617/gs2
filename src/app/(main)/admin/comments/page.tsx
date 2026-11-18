"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { AdminSearch, MoreButton, StatusChip } from "@/components/admin/parts";
import { CommentAdminSheet, type AdminCommentTarget } from "@/components/admin/comment-admin-sheet";
import { useAdminList } from "@/components/admin/use-admin-list";
import type { AdminComment } from "@/components/admin/types";
import { formatRelative } from "@/lib/time";

/** すべてのコメントの一覧（検索）と、編集・非表示・削除 */
function AdminCommentsContent() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminCommentTarget | null>(null);
  const list = useAdminList<AdminComment>(`/api/admin/comments${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="コメント" subtitle="すべてのコメントを編集・非表示・削除できます" back="/admin" />
      <AdminSearch placeholder="コメントの本文で検索" onSearch={setQ} />
      {list.isLoading ? (
        <PageSpinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={<MessagesSquare size={24} />} title="該当するコメントはありません" />
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="admin-comments">
          {list.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected({ id: c.id, postId: c.postId, body: c.body, status: c.status, author: c.author })}
                className="neu neu-sm neu-press flex w-full flex-col gap-1 rounded-[18px] px-4 py-3 text-left"
                data-testid="admin-comment-row"
              >
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  <span className="truncate">
                    {c.author.displayName} @{c.author.handle} ・ {formatRelative(c.createdAt)}
                  </span>
                  {c.status === "hidden" && <StatusChip tone="warn">非表示</StatusChip>}
                </span>
                <span className="line-clamp-3 text-sm whitespace-pre-wrap text-ink">{c.body}</span>
                <span className="truncate text-xs text-ink-3">投稿「{c.postTitle}」へのコメント</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MoreButton hasMore={list.hasMore} loading={list.isValidating} onClick={list.loadMore} />
      <CommentAdminSheet comment={selected} onClose={() => setSelected(null)} onChanged={() => list.reload()} />
    </div>
  );
}

export default function AdminCommentsPage() {
  return (
    <AdminOnly>
      <AdminCommentsContent />
    </AdminOnly>
  );
}
