"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { MoreButton } from "@/components/admin/parts";
import { useAdminList } from "@/components/admin/use-admin-list";
import type { AuditLog } from "@/components/admin/types";
import { formatJstDateTime } from "@/lib/time";

const ACTION_LABEL: Record<string, string> = {
  "post.edit": "投稿を編集",
  "post.hide": "投稿を非表示",
  "post.restore": "投稿を表示に戻す",
  "post.delete": "投稿を削除",
  "comment.edit": "コメントを編集",
  "comment.hide": "コメントを非表示",
  "comment.restore": "コメントを表示に戻す",
  "comment.delete": "コメントを削除",
  "user.warn": "アカウントに警告",
  "user.delete": "アカウントを削除",
  "user.role": "権限を変更",
  "user.profile": "プロフィールを修正",
  "report.dismiss": "通報を処理（問題なし）",
  "report.hide": "通報を処理（非表示）",
  "report.delete": "通報を処理（削除）",
  "report.restore": "通報を処理（表示に戻す）",
  "theme.start": "お題を開始",
  "theme.schedule": "お題を予約",
  "theme.edit": "お題を編集",
  "theme.end": "お題を終了",
  "theme.delete": "お題の予約を取り消し",
  "pool.add": "お題の候補を追加",
  "pool.enable": "お題の候補を有効化",
  "pool.disable": "お題の候補を無効化",
  "event.start": "イベントを開始",
  "event.schedule": "イベントを予約",
  "event.edit": "イベントを変更",
  "event.end": "イベントを終了",
  "event.delete": "イベントの予約を取り消し",
  "settings.update": "設定を変更",
};

/** 記録の中身を短い文にする */
function summary(l: AuditLog): string {
  const d = (l.data ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["title", "displayName", "handle", "message", "reason", "note", "role", "body"]) {
    const v = d[key];
    if (typeof v === "string" && v) parts.push(v.length > 60 ? `${v.slice(0, 60)}…` : v);
  }
  return parts.join(" ・ ");
}

/** 管理者の操作の記録 */
function AdminAuditContent() {
  const list = useAdminList<AuditLog>("/api/admin/audit");
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="操作の記録" subtitle="管理者が行った操作の履歴" back="/admin" />
      {list.isLoading ? (
        <PageSpinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={<ScrollText size={24} />} title="まだ記録はありません" />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-audit">
          {list.items.map((l) => (
            <li key={l.id} className="neu neu-sm rounded-[16px] px-4 py-3" data-testid="audit-row">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-ink">{ACTION_LABEL[l.action] ?? l.action}</span>
                <span className="shrink-0 text-xs text-ink-3">{formatJstDateTime(l.createdAt)}</span>
              </p>
              {summary(l) && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{summary(l)}</p>}
              <p className="mt-0.5 text-xs text-ink-3">{l.actor ? `${l.actor.displayName} @${l.actor.handle}` : "（削除された管理者）"}</p>
            </li>
          ))}
        </ul>
      )}
      <MoreButton hasMore={list.hasMore} loading={list.isValidating} onClick={list.loadMore} />
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <AdminOnly>
      <AdminAuditContent />
    </AdminOnly>
  );
}
