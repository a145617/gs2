"use client";

import { PageHeader } from "@/components/shell/page-header";
import { PostGrid } from "@/components/post/post-grid";

/** 自分がブックマークした投稿 */
export default function BookmarksPage() {
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="ブックマーク" />
      <PostGrid endpoint="/api/me/bookmarks" emptyText="ブックマークした投稿はまだありません" />
    </div>
  );
}
