"use client";

import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { FollowButton } from "./follow-button";
import { useMe } from "@/lib/client/session";
import type { UserListPage } from "@/lib/types";

/** ユーザーの一覧（フォロワー・フォロー中） */
export function UserList({ endpoint, emptyText }: { endpoint: string; emptyText: string }) {
  const { me } = useMe();
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<UserListPage>((i, prev) => {
    if (i === 0) return endpoint;
    if (!prev?.nextCursor) return null;
    return `${endpoint}?cursor=${encodeURIComponent(prev.nextCursor)}`;
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
  if (items.length === 0) return <EmptyState icon={<Users size={24} />} title={emptyText} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3" data-testid="user-list">
        {items.map((u) => (
          <li key={u.id} className="neu neu-sm flex items-center gap-3 rounded-[18px] px-4 py-3">
            <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={u.avatarUrl} name={u.displayName} size={42} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold text-ink">{u.displayName}</span>
                <span className="truncate text-xs text-ink-3">@{u.handle}</span>
                {u.bio && <span className="truncate text-xs text-ink-2">{u.bio}</span>}
              </span>
            </Link>
            {me && me.id !== u.id && <FollowButton handle={u.handle} following={u.following} />}
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button size="sm" loading={isValidating} onClick={() => setSize(size + 1)}>
          もっと見る
        </Button>
      )}
    </div>
  );
}
