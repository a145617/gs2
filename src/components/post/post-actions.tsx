"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import type { PostDTO } from "@/lib/types";

const btn =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm transition-[box-shadow,color,transform]";

/** いいね・コメント・ブックマーク・共有のボタン */
export function PostActions({ post, variant = "neu" }: { post: PostDTO; variant?: "neu" | "glass" }) {
  const [liked, setLiked] = useState(post.viewer.liked);
  const [likes, setLikes] = useState(post.counts.likes);
  const [saved, setSaved] = useState(post.viewer.bookmarked);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const disabled = post.locked || post.status !== "visible";
  const surface = variant === "glass" ? "glass" : "neu neu-sm neu-convex neu-press";

  async function toggleLike() {
    if (busy || disabled) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const res = await api<{ liked: boolean; count: number }>(`/api/posts/${post.id}/like`, { method: next ? "POST" : "DELETE" });
      setLiked(res.liked);
      setLikes(res.count);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast.error(e instanceof ApiError ? e.message : "いいねできませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (disabled) return;
    const next = !saved;
    setSaved(next);
    try {
      await api(`/api/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
      toast.show(next ? "ブックマークに保存しました" : "ブックマークを外しました");
    } catch (e) {
      setSaved(!next);
      toast.error(e instanceof ApiError ? e.message : "保存できませんでした");
    }
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.show("リンクをコピーしました");
    } catch {
      // 共有をキャンセルした場合など
    }
  }

  return (
    <div className="flex items-center gap-2" data-testid="post-actions">
      <button
        type="button"
        onClick={toggleLike}
        disabled={disabled}
        aria-pressed={liked}
        aria-label={liked ? "いいねを取り消す" : "いいね"}
        className={clsx(btn, surface, liked ? "text-[#e0475f]" : "text-ink-2", "disabled:opacity-40")}
        data-testid="like-button"
      >
        <Heart size={18} fill={liked ? "currentColor" : "none"} />
        <span className="tabular-nums" data-testid="like-count">
          {likes}
        </span>
      </button>
      <Link
        href={`/p/${post.id}#comments`}
        aria-label="コメント"
        className={clsx(btn, surface, "text-ink-2", disabled && "pointer-events-none opacity-40")}
      >
        <MessageCircle size={18} />
        <span className="tabular-nums">{post.counts.comments}</span>
      </Link>
      <span className="flex-1" />
      <button
        type="button"
        onClick={toggleSave}
        disabled={disabled}
        aria-pressed={saved}
        aria-label={saved ? "ブックマークを外す" : "ブックマーク"}
        className={clsx(btn, surface, saved ? "text-accent" : "text-ink-2", "disabled:opacity-40")}
        data-testid="bookmark-button"
      >
        <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
      </button>
      <button type="button" onClick={share} aria-label="共有" className={clsx(btn, surface, "text-ink-2")}>
        <Share2 size={17} />
      </button>
    </div>
  );
}
