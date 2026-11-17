"use client";

import { useEffect } from "react";
import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { useSWRConfig } from "swr";
import clsx from "clsx";
import { Bell, Heart, MessageCircle, Palette, Pencil, ShieldCheck, Trash, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { api } from "@/lib/client/api";
import { formatRelative } from "@/lib/time";
import type { NotificationDTO, NotificationPage } from "@/lib/types";

const ICONS: Record<NotificationDTO["type"], LucideIcon> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  warning: ShieldCheck,
  post_edited: Pencil,
  post_removed: Trash,
  comment_edited: Pencil,
  comment_removed: Trash,
  event: Palette,
  report_resolved: ShieldCheck,
};

function message(n: NotificationDTO): string {
  const name = n.actor?.displayName ?? "だれか";
  const d = n.data as Record<string, string | undefined>;
  switch (n.type) {
    case "like":
      return `${name}さんがあなたの投稿にいいねしました`;
    case "comment":
      return `${name}さんがコメントしました：${d.excerpt ?? ""}`;
    case "follow":
      return `${name}さんにフォローされました`;
    case "warning":
      return `管理者から警告が届きました：${d.message ?? ""}`;
    case "post_edited":
      return "管理者があなたの投稿を編集しました";
    case "post_removed":
      return `管理者があなたの投稿を削除しました${d.reason ? `（${d.reason}）` : ""}`;
    case "comment_edited":
      return "管理者があなたのコメントを編集しました";
    case "comment_removed":
      return `管理者があなたのコメントを削除しました${d.reason ? `（${d.reason}）` : ""}`;
    case "event":
      return d.message ?? `イベント「${d.title ?? ""}」が始まりました`;
    case "report_resolved":
      return "あなたの通報が確認されました。ご協力ありがとうございます";
  }
}

function href(n: NotificationDTO): string {
  if (n.type === "follow" && n.actor) return `/u/${n.actor.handle}`;
  if (n.type === "event") return "/event";
  if (n.postId) return `/p/${n.postId}${n.type === "comment" ? "#comments" : ""}`;
  return "/notifications";
}

/** お知らせ（いいね・コメント・フォロー・管理者からの連絡など） */
export default function NotificationsPage() {
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<NotificationPage>((i, prev) => {
    if (i === 0) return "/api/notifications";
    if (!prev?.nextCursor) return null;
    return `/api/notifications?cursor=${encodeURIComponent(prev.nextCursor)}`;
  });
  const { mutate } = useSWRConfig();
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;
  const hasUnread = items.some((n) => !n.read);

  // 開いたら既読にする（一覧の表示は「未読」の印を残したままにする）
  useEffect(() => {
    if (!hasUnread) return;
    api("/api/notifications", { method: "POST" })
      .then(() => mutate("/api/me"))
      .catch(() => {});
  }, [hasUnread, mutate]);

  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="お知らせ" />
      {isLoading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell size={24} />} title="お知らせはまだありません" />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="notifications">
          {items.map((n) => {
            const Icon = ICONS[n.type];
            return (
              <li key={n.id}>
                <Link
                  href={href(n)}
                  className={clsx(
                    "neu neu-sm flex items-center gap-3 rounded-[18px] px-4 py-3",
                    !n.read && "outline-2 outline-offset-[-2px] outline-[color-mix(in_oklab,var(--accent)_45%,transparent)]",
                  )}
                >
                  <span className="relative shrink-0">
                    {n.actor ? (
                      <Avatar src={n.actor.avatarUrl} name={n.actor.displayName} size={40} />
                    ) : (
                      <span className="neu-inset neu-sm flex h-10 w-10 items-center justify-center rounded-full text-accent">
                        <Icon size={18} />
                      </span>
                    )}
                    {n.actor && (
                      <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                        <Icon size={11} />
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-sm text-ink" data-testid="notification-text">
                      {message(n)}
                    </span>
                    <span className="text-xs text-ink-3">{formatRelative(n.createdAt)}</span>
                  </span>
                  {n.postThumb && (
                    // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する縮小画像
                    <img src={n.postThumb} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <Button size="sm" loading={isValidating} onClick={() => setSize(size + 1)}>
          もっと見る
        </Button>
      )}
    </div>
  );
}
