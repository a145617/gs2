"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { UserList } from "@/components/profile/user-list";
import { EmptyState } from "@/components/ui/empty";

export function FollowListPage() {
  const { handle, kind } = useParams<{ handle: string; kind: string }>();
  if (kind !== "followers" && kind !== "following") return <EmptyState title="ページが見つかりませんでした" />;
  const title = kind === "followers" ? "フォロワー" : "フォロー中";
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title={title} subtitle={`@${handle}`} />
      <UserList
        endpoint={`/api/users/${encodeURIComponent(handle)}/${kind}`}
        emptyText={kind === "followers" ? "まだフォロワーはいません" : "まだ誰もフォローしていません"}
      />
    </div>
  );
}
