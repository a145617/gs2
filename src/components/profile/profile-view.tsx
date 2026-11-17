"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bookmark, CalendarClock, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { PostGrid } from "@/components/post/post-grid";
import { FollowButton } from "./follow-button";
import type { ApiError } from "@/lib/client/api";
import type { ProfileResponse } from "@/lib/types";

export function formatJoined(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月から利用`;
}

function Count({ href, label, value, testId }: { href?: string; label: string; value: number; testId?: string }) {
  const inner = (
    <span className="flex flex-col items-center">
      <span className="font-display text-lg font-bold text-ink tabular-nums" data-testid={testId}>
        {value}
      </span>
      <span className="text-[11px] text-ink-3">{label}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="neu-press rounded-2xl px-3 py-1">
      {inner}
    </Link>
  ) : (
    <span className="px-3 py-1">{inner}</span>
  );
}

/** プロフィール（アイコン・ユーザー名・ユーザーID・自己紹介・フォロー・投稿） */
export function ProfileView({ handle, actions, children }: { handle: string; actions?: ReactNode; children?: ReactNode }) {
  const key = `/api/users/${encodeURIComponent(handle)}`;
  const { data, error, isLoading, mutate } = useSWR<ProfileResponse, ApiError>(key);

  if (isLoading) return <PageSpinner />;
  if (error || !data) {
    return <EmptyState title={error?.status === 404 ? "ユーザーが見つかりませんでした" : "読み込めませんでした"} />;
  }
  const { user, isMe, counts } = data;
  const base = `/u/${encodeURIComponent(user.handle)}`;

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <Card className="flex flex-col items-center gap-4 px-6 pt-8 pb-6 text-center">
        <Avatar src={user.avatarUrl} name={user.displayName} size={96} ring />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-xl font-bold break-all text-ink" data-testid="profile-name">
            {user.displayName}
          </h1>
          <p className="text-sm text-ink-3" data-testid="profile-handle">
            @{user.handle}
          </p>
          {data.followsMe && !isMe && (
            <span className="neu-inset neu-sm mt-1 rounded-full px-2.5 py-0.5 text-[11px] text-ink-2">フォローされています</span>
          )}
        </div>
        {user.bio && <p className="max-w-sm text-sm whitespace-pre-wrap text-ink-2">{user.bio}</p>}
        <div className="neu-inset neu-sm flex items-center justify-center gap-2 rounded-[18px] px-2 py-1">
          <Count label="投稿" value={counts.posts} testId="count-posts" />
          <Count href={`${base}/followers`} label="フォロワー" value={counts.followers} testId="count-followers" />
          <Count href={`${base}/following`} label="フォロー中" value={counts.following} testId="count-following" />
        </div>
        <p className="inline-flex items-center gap-1 text-xs text-ink-3">
          <CalendarClock size={13} />
          {formatJoined(user.createdAt)}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {isMe ? (
            <>
              <LinkButton href="/settings" size="sm" icon={<Settings size={15} />}>
                プロフィールを編集
              </LinkButton>
              <LinkButton href="/bookmarks" size="sm" icon={<Bookmark size={15} />}>
                ブックマーク
              </LinkButton>
            </>
          ) : (
            <>
              <FollowButton
                key={String(data.following)}
                handle={user.handle}
                following={data.following}
                onChange={() => mutate()}
              />
              {actions}
            </>
          )}
        </div>
      </Card>
      {children}
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-bold tracking-wider text-ink-3">投稿</h2>
        <PostGrid endpoint={`/api/users/${encodeURIComponent(user.handle)}/posts`} />
      </section>
    </div>
  );
}
