"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { PageHeader } from "@/components/shell/page-header";
import { PostGrid } from "@/components/post/post-grid";

/** ハッシュタグの付いた投稿の一覧 */
export function TagPage() {
  const { name } = useParams<{ name: string }>();
  const tag = decodeURIComponent(name);
  const endpoint = `/api/tags/${encodeURIComponent(tag)}`;
  const { data } = useSWR<{ tag: string; postCount: number }>(endpoint);
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title={`#${data?.tag ?? tag}`} subtitle={data ? `${data.postCount}件の投稿` : undefined} />
      <PostGrid endpoint={endpoint} emptyText="このハッシュタグの投稿はまだありません" />
    </div>
  );
}
