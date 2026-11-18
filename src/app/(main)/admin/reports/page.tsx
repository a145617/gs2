"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ConfirmForm, MoreButton, StatusChip } from "@/components/admin/parts";
import { UserAdminSheet } from "@/components/admin/user-admin-sheet";
import { useAdminList } from "@/components/admin/use-admin-list";
import type { AdminReport } from "@/components/admin/types";
import { api } from "@/lib/client/api";
import { REPORT_REASON_LABEL } from "@/lib/moderation";
import { formatRelative } from "@/lib/time";

type Status = "open" | "resolved" | "dismissed";
type Action = "dismiss" | "hide" | "delete" | "restore";

const TARGET_LABEL = { post: "投稿", comment: "コメント", user: "アカウント" } as const;

function Target({ r }: { r: AdminReport }) {
  const t = r.target;
  if (r.targetType === "post") {
    return (
      <Link href={t.postId ? `/p/${t.postId}` : "#"} className="neu-inset neu-sm flex items-center gap-3 rounded-[16px] p-2.5">
        {t.thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する縮小画像
          <img src={t.thumb} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{t.title ?? "（削除済み）"}</span>
          <span className="block truncate text-xs text-ink-3">{t.user ? `${t.user.displayName} @${t.user.handle}` : ""}</span>
        </span>
        {t.postStatus === "hidden" && <StatusChip tone="warn">非表示中</StatusChip>}
        {t.postStatus === "deleted" && <StatusChip tone="danger">削除済み</StatusChip>}
      </Link>
    );
  }
  if (r.targetType === "comment") {
    return (
      <Link href={t.postId ? `/p/${t.postId}#comments` : "#"} className="neu-inset neu-sm block rounded-[16px] p-3">
        <span className="block text-xs text-ink-3">{t.user ? `${t.user.displayName} @${t.user.handle}` : ""}</span>
        <span className="mt-0.5 line-clamp-3 block text-sm whitespace-pre-wrap text-ink">{t.commentBody ?? "（削除済み）"}</span>
        {t.commentStatus === "hidden" && (
          <span className="mt-1 block">
            <StatusChip tone="warn">非表示中</StatusChip>
          </span>
        )}
      </Link>
    );
  }
  return (
    <Link href={t.user ? `/u/${t.user.handle}` : "#"} className="neu-inset neu-sm block rounded-[16px] p-3 text-sm text-ink">
      {t.user ? `${t.user.displayName} @${t.user.handle}` : "（削除済みのアカウント）"}
      {t.user?.status === "deleted" && <StatusChip tone="danger">削除済み</StatusChip>}
    </Link>
  );
}

const ACTION_TEXT: Record<Action, { label: string; done: string; danger?: boolean; description: string; reason?: string }> = {
  dismiss: { label: "問題なし", done: "問題なしとして処理しました", description: "対象はそのままにして、この対象への通報をすべて閉じます。" },
  hide: { label: "非表示にする", done: "非表示にしました", description: "対象を非表示にして、この対象への通報をすべて閉じます。あとで表示に戻せます。", reason: "メモ（任意・記録に残ります）" },
  restore: { label: "表示に戻す", done: "表示に戻しました", description: "非表示になっている対象を表示に戻し、この対象への通報を閉じます。" },
  delete: {
    label: "削除する",
    done: "削除しました",
    danger: true,
    description: "対象を削除します。元に戻せません。投稿者には理由とともに通知されます。",
    reason: "削除の理由（投稿者に通知されます）",
  },
};

/** 通報の一覧と処理 */
function AdminReportsContent() {
  const [status, setStatus] = useState<Status>("open");
  const list = useAdminList<AdminReport>(`/api/admin/reports?status=${status}`);
  const [pending, setPending] = useState<{ report: AdminReport; action: Action } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const after = () => {
    list.reload();
    void mutate("/api/admin/stats");
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="通報" subtitle="同じ対象への通報は、1回の処理でまとめて閉じられます" back="/admin" />
      <Segmented
        ariaLabel="通報の状態"
        value={status}
        onChange={setStatus}
        options={[
          { value: "open", label: "未対応" },
          { value: "resolved", label: "対応済み" },
          { value: "dismissed", label: "問題なし" },
        ]}
      />
      {list.isLoading ? (
        <PageSpinner />
      ) : list.items.length === 0 ? (
        <EmptyState icon={<Flag size={24} />} title={status === "open" ? "未対応の通報はありません" : "通報はありません"} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-reports">
          {list.items.map((r) => {
            const hidden = r.target.postStatus === "hidden" || r.target.commentStatus === "hidden";
            const gone = r.target.postStatus === "deleted" || r.target.commentStatus === "deleted" || r.target.user?.status === "deleted";
            return (
              <li key={r.id} className="neu neu-sm flex flex-col gap-3 rounded-[20px] p-4" data-testid="admin-report">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone="accent">{TARGET_LABEL[r.targetType]}</StatusChip>
                  <StatusChip tone="warn">{REPORT_REASON_LABEL[r.reason]}</StatusChip>
                  <span className="ml-auto text-xs text-ink-3">{formatRelative(r.createdAt)}</span>
                </div>
                <Target r={r} />
                {r.detail && <p className="text-sm whitespace-pre-wrap text-ink-2">「{r.detail}」</p>}
                <p className="text-xs text-ink-3">
                  通報者: {r.reporter.displayName} @{r.reporter.handle}
                  {r.resolution && status !== "open" && ` ・ 処理: ${r.resolution}`}
                </p>
                {status === "open" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setPending({ report: r, action: "dismiss" })} data-testid="report-dismiss">
                      問題なし
                    </Button>
                    {r.targetType !== "user" && !gone && (
                      <Button
                        size="sm"
                        onClick={() => setPending({ report: r, action: hidden ? "restore" : "hide" })}
                        data-testid={hidden ? "report-restore" : "report-hide"}
                      >
                        {hidden ? "表示に戻す" : "非表示にする"}
                      </Button>
                    )}
                    {r.targetType === "user" && r.target.user && !gone && (
                      <Button size="sm" onClick={() => setUserId(r.target.user!.id)}>
                        警告・アカウントの管理
                      </Button>
                    )}
                    {!gone && (
                      <Button size="sm" variant="danger" onClick={() => setPending({ report: r, action: "delete" })} data-testid="report-delete">
                        削除する
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <MoreButton hasMore={list.hasMore} loading={list.isValidating} onClick={list.loadMore} />

      <Sheet open={!!pending} onClose={() => setPending(null)} title={pending ? `通報の処理: ${ACTION_TEXT[pending.action].label}` : ""}>
        {pending && (
          <ConfirmForm
            key={`${pending.report.id}-${pending.action}`}
            description={ACTION_TEXT[pending.action].description}
            confirmLabel={ACTION_TEXT[pending.action].label}
            danger={ACTION_TEXT[pending.action].danger}
            reasonLabel={ACTION_TEXT[pending.action].reason}
            onConfirm={(note) => api(`/api/admin/reports/${pending.report.id}`, { method: "POST", json: { action: pending.action, note } })}
            onCancel={() => setPending(null)}
            onDone={() => {
              toast.success(ACTION_TEXT[pending.action].done);
              setPending(null);
              after();
            }}
          />
        )}
      </Sheet>
      <UserAdminSheet userId={userId} onClose={() => setUserId(null)} onChanged={after} />
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminOnly>
      <AdminReportsContent />
    </AdminOnly>
  );
}
