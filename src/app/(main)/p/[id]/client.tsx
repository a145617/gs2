"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { ShieldCheck, Trash } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { PostAdminSheet } from "@/components/admin/post-admin-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Caption, LockedImage, MetaLine, PostAuthorRow, TagList } from "@/components/post/post-parts";
import { PostActions } from "@/components/post/post-actions";
import { Comments } from "@/components/post/comments";
import { ContentMenu } from "@/components/moderation/content-menu";
import { ThemeStage } from "@/components/stage/theme-stage";
import { EventStage } from "@/components/event/event-stage";
import { api, ApiError } from "@/lib/client/api";
import { useMe } from "@/lib/client/session";
import { formatDayKey } from "@/lib/time";
import type { PostDTO } from "@/lib/types";

/** 投稿の詳細ページ */
export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<{ post: PostDTO }, ApiError>(`/api/posts/${id}`);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  if (isLoading) return <PageSpinner />;
  if (error || !data) return <EmptyState title={error?.status === 404 ? "投稿が見つかりませんでした" : "読み込めませんでした"} />;
  const post = data.post;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      await mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });
      toast.success("投稿を削除しました");
      router.replace("/me");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "削除できませんでした");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <PageHeader
        title={post.locked ? "今日のお題の投稿" : post.title}
        subtitle={post.theme ? `${formatDayKey(post.theme.dayKey)}のお題「${post.theme.title}」` : undefined}
        right={
          !post.viewer.isMine ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <IconButton label="投稿を管理" onClick={() => setAdminOpen(true)} data-testid="admin-post-menu">
                  <ShieldCheck size={18} />
                </IconButton>
              )}
              <ContentMenu
                targetType="post"
                targetId={post.id}
                label="この投稿のメニュー"
                user={{ handle: post.author.handle, displayName: post.author.displayName }}
                onReported={(hidden) => {
                  if (hidden) toast.show("通報が集まったため、この投稿は確認が済むまで非表示になりました");
                  void mutate(`/api/posts/${post.id}`);
                }}
                onMuteChange={(muted) => {
                  if (muted) router.back();
                }}
              />
            </div>
          ) : undefined
        }
      />
      {isAdmin && (
        <PostAdminSheet
          postId={adminOpen ? post.id : null}
          showLink={false}
          onClose={() => setAdminOpen(false)}
          onChanged={() => void mutate(`/api/posts/${post.id}`)}
          onDeleted={() => {
            setAdminOpen(false);
            void mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, { revalidate: true });
            router.back();
          }}
        />
      )}
      <Card className="flex flex-col gap-4 p-3">
        <div className="px-1 pt-1">
          <PostAuthorRow post={post} />
        </div>
        {post.locked || !post.image ? (
          <LockedImage post={post} className="aspect-[4/5] w-full rounded-[18px]" />
        ) : post.event ? (
          <div data-testid="post-image">
            <EventStage src={post.image.lg} width={post.image.width} height={post.image.height} title={post.title} event={post.event} />
          </div>
        ) : post.theme ? (
          <div data-testid="post-image">
            <ThemeStage
              template={post.theme.template}
              accent={post.theme.accent}
              src={post.image.lg}
              width={post.image.width}
              height={post.image.height}
              title={post.title}
              authorName={post.author.displayName}
              dayLabel={formatDayKey(post.theme.dayKey)}
              variant="detail"
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像
          <img
            src={post.image.lg}
            alt={post.title}
            width={post.image.width}
            height={post.image.height}
            className="w-full rounded-[18px]"
            style={{ background: `url(${post.placeholder}) center/cover`, aspectRatio: `${post.image.width} / ${post.image.height}` }}
            data-testid="post-image"
          />
        )}
        {!post.locked && (
          <div className="flex flex-col gap-3 px-2 pb-2">
            <PostActions key={`${post.id}-${post.counts.likes}-${post.viewer.liked}`} post={post} />
            <h2 className="font-display text-xl font-bold text-ink" data-testid="post-title">
              {post.title}
            </h2>
            {post.caption && <Caption text={post.caption} />}
            <TagList tags={post.tags} />
            <MetaLine post={post} />
            {post.status === "hidden" && <p className="text-xs font-bold text-warn">この投稿は現在非表示です（通報または管理者の操作）</p>}
            {post.editedByAdmin && <p className="text-xs text-ink-3">管理者が編集しました</p>}
            {post.theme && (
              <Link href={`/themes/${post.theme.id}`} className="text-xs text-accent">
                お題「{post.theme.title}」の投稿をもっと見る
              </Link>
            )}
          </div>
        )}
      </Card>
      <Comments post={post} />
      {post.viewer.isMine && (
        <Button variant="danger" icon={<Trash size={16} />} onClick={() => setConfirm(true)}>
          この投稿を削除
        </Button>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="投稿を削除しますか？">
        <p className="mb-4 text-sm text-ink-2">削除した投稿は元に戻せません。</p>
        <Button variant="danger" className="w-full" loading={deleting} onClick={remove}>
          削除する
        </Button>
      </Sheet>
    </div>
  );
}
