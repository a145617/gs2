"use client";

import Link from "next/link";
import { Hash, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { splitCaption } from "@/lib/hashtags";
import { CAPTURE_MODE_LABEL, formatPhotoMeta } from "@/lib/photo-meta";
import { formatRelative } from "@/lib/time";
import type { PostDTO } from "@/lib/types";

/** 作者の行（アイコン・ユーザー名・ユーザーID・投稿時刻） */
export function PostAuthorRow({ post, now }: { post: PostDTO; now?: Date }) {
  return (
    <Link href={`/u/${post.author.handle}`} className="flex min-w-0 items-center gap-2.5">
      <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={36} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-bold text-ink">{post.author.displayName}</span>
        <span className="truncate text-xs text-ink-3">
          @{post.author.handle} ・ {formatRelative(post.createdAt, now)}
        </span>
      </span>
    </Link>
  );
}

/** キャプション（#タグ はリンクにする） */
export function Caption({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
      {splitCaption(text).map((p, i) =>
        p.type === "tag" ? (
          <Link key={i} href={`/tags/${encodeURIComponent(p.value.normalize("NFKC").toLowerCase())}`} className="text-accent">
            #{p.value}
          </Link>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="ハッシュタグ">
      {tags.map((t) => (
        <li key={t}>
          <Link
            href={`/tags/${encodeURIComponent(t)}`}
            className="neu-inset neu-sm inline-flex items-center gap-0.5 rounded-full px-3 py-1 text-xs text-accent"
          >
            <Hash size={11} />
            {t}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MetaLine({ post }: { post: PostDTO }) {
  if (!post.meta) return null;
  const parts = formatPhotoMeta(post.meta);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3" data-testid="post-meta">
      <span className="neu-inset neu-sm rounded-full px-2.5 py-0.5 font-bold text-ink-2">{CAPTURE_MODE_LABEL[post.meta.mode]}</span>
      {parts.map((p) => (
        <span key={p} className="tabular-nums">
          {p}
        </span>
      ))}
      {(post.meta.make || post.meta.model) && <span>{[post.meta.make, post.meta.model].filter(Boolean).join(" ")}</span>}
    </p>
  );
}

/** 投稿するまで見られない投稿（ぼかしたプレビュー） */
export function LockedImage({ post, className }: { post: PostDTO; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} data-testid="locked-post">
      {/* eslint-disable-next-line @next/next/no-img-element -- ぼかし用の極小プレビュー */}
      <img src={post.placeholder} alt="" className="h-full w-full scale-110 object-cover blur-xl" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25 p-4 text-center text-white">
        <Lock size={22} />
        <p className="text-sm font-bold">今日のお題に投稿すると見られます</p>
      </div>
    </div>
  );
}

/** 一覧用の小さな写真 */
export function PostThumb({ post }: { post: PostDTO }) {
  return (
    <Link href={`/p/${post.id}`} className="neu neu-sm block aspect-square overflow-hidden rounded-[16px] p-1" aria-label={post.locked ? "非公開の投稿" : post.title}>
      {post.locked || !post.image ? (
        <LockedImage post={post} className="h-full w-full rounded-[12px]" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する縮小画像
        <img
          src={post.image.sm}
          alt={post.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-[12px] object-cover"
          style={{ background: `url(${post.placeholder}) center/cover` }}
        />
      )}
    </Link>
  );
}
