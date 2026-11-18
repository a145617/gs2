"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { AdminSearch, MoreButton, StatusChip } from "@/components/admin/parts";
import { UserAdminSheet } from "@/components/admin/user-admin-sheet";
import { useAdminList } from "@/components/admin/use-admin-list";
import type { AdminUser } from "@/components/admin/types";
import { formatJstDate } from "@/lib/time";

/** アカウントの一覧（検索）と、警告・削除など */
function AdminUsersContent() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useAdminList<AdminUser>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="アカウント" subtitle="警告・プロフィールの修正・削除ができます" back="/admin" />
      <AdminSearch placeholder="ユーザー名・ユーザーID・メールアドレスで検索" onSearch={setQ} />
      {list.isLoading ? (
        <PageSpinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="該当するアカウントはありません" />
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="admin-users">
          {list.items.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setSelected(u.id)}
                className="neu neu-sm neu-press flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left"
                data-testid="admin-user-row"
              >
                <Avatar src={u.avatarUrl} name={u.displayName} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-ink">{u.displayName}</span>
                  <span className="block truncate text-xs text-ink-3">
                    @{u.handle} ・ {u.email} ・ {formatJstDate(u.createdAt)}登録
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {u.role === "admin" && <StatusChip tone="accent">管理者</StatusChip>}
                    {u.isTestUser && <StatusChip>テスト用</StatusChip>}
                    {u.warnings > 0 && <StatusChip tone="warn">警告 {u.warnings}</StatusChip>}
                    {u.openReports > 0 && <StatusChip tone="danger">通報 {u.openReports}</StatusChip>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MoreButton hasMore={list.hasMore} loading={list.isValidating} onClick={list.loadMore} />
      <UserAdminSheet userId={selected} onClose={() => setSelected(null)} onChanged={() => list.reload()} />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <AdminUsersContent />
    </AdminOnly>
  );
}
