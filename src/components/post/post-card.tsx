"use client";

import Link from "next/link";
import { Camera, Lock } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { ContentMenu } from "@/components/moderation/content-menu";
import { PostActions } from "./post-actions";
import { Caption, MetaLine, PostAuthorRow, TagList } from "./post-parts";
import { useViewTracker } from "@/lib/client/view-tracker";
import { ThemeStage } from "@/components/stage/theme-stage";
import { EventStage } from "@/components/event/event-stage";
import { formatDayKey } from "@/lib/time";
import type { FeedPost } from "@/lib/types";

/** フィードの1件（ニューモーフィズムのカード） */
export function PostCard({ post, showDebug }: { post: FeedPost; showDebug?: boolean }) {
  const ref = useViewTracker(post.id, !post.locked && !post.viewer.isMine);
  return (
    <article
      ref={(el) => {
        ref.current = el;
      }}
      className="neu flex flex-col gap-3 rounded-[26px] p-3"
      data-testid="feed-item"
      data-post-id={post.id}
      data-section={post.feedSection}
    >
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <PostAuthorRow post={post} />
        {!post.viewer.isMine && (
          <ContentMenu
            targetType="post"
            targetId={post.id}
            label="この投稿のメニュー"
            user={{ handle: post.author.handle, displayName: post.author.displayName }}
          />
        )}
      </div>

      {post.locked || !post.image ? (
        <div className="relative overflow-hidden rounded-[20px]" style={{ aspectRatio: "4 / 5" }} data-testid="locked-post">
          {/* eslint-disable-next-line @next/next/no-img-element -- ぼかし用の極小プレビュー */}
          <img src={post.placeholder} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/25 p-6 text-center text-white">
            <Lock size={24} />
            <p className="text-sm font-bold">今日のお題に投稿すると、この写真が見られます</p>
            <LinkButton href="/camera" variant="glass" size="sm" icon={<Camera size={15} />} className="text-white">
              撮りに行く
            </LinkButton>
          </div>
        </div>
      ) : post.event ? (
        <EventStage src={post.image.md} width={post.image.width} height={post.image.height} title={post.title} event={post.event} />
      ) : post.theme ? (
        <ThemeStage
          template={post.theme.template}
          accent={post.theme.accent}
          src={post.image.md}
          width={post.image.width}
          height={post.image.height}
          title={post.title}
          authorName={post.author.displayName}
          dayLabel={formatDayKey(post.theme.dayKey)}
          variant="card"
        />
      ) : (
        <Link href={`/p/${post.id}`} className="block overflow-hidden rounded-[20px]" aria-label={post.title}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像 */}
          <img
            src={post.image.md}
            alt={post.title}
            width={post.image.width}
            height={post.image.height}
            loading="lazy"
            decoding="async"
            className="w-full object-cover"
            style={{
              aspectRatio: `${post.image.width} / ${post.image.height}`,
              maxHeight: "75dvh",
              background: `url(${post.placeholder}) center/cover`,
            }}
          />
        </Link>
      )}

      {!post.locked && (
        <div className="flex flex-col gap-2.5 px-2 pb-2">
          <PostActions post={post} />
          <Link href={`/p/${post.id}`}>
            <h3 className="font-display text-lg font-bold text-ink">{post.title}</h3>
          </Link>
          {post.caption && (
            <div className="line-clamp-3">
              <Caption text={post.caption} />
            </div>
          )}
          <TagList tags={post.tags} />
          <MetaLine post={post} />
          {post.theme && (
            <Link href={`/themes/${post.theme.id}`} className="text-xs text-ink-3">
              {formatDayKey(post.theme.dayKey)}のお題「{post.theme.title}」
            </Link>
          )}
        </div>
      )}

      {showDebug && post.feedDebug && (
        <pre className="neu-inset neu-sm overflow-x-auto rounded-xl p-2 text-[10px] leading-snug text-ink-2" data-testid="feed-debug">
          {JSON.stringify(post.feedDebug, null, 1)}
        </pre>
      )}
    </article>
  );
}
