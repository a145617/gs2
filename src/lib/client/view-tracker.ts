"use client";

import { useEffect, useRef } from "react";

// 閲覧数の記録: 投稿が十分に（投稿の60%以上、または画面の半分以上を占めて）1.5秒以上表示されたら
// 「見た」として送る（まとめて送信）。画面より縦に長い投稿でも数えられるようにしている。

const queue = new Set<string>();
const sent = new Set<string>();
let timer: number | null = null;

function flush() {
  timer = null;
  if (queue.size === 0) return;
  const postIds = [...queue];
  queue.clear();
  for (const id of postIds) sent.add(id);
  const body = JSON.stringify({ postIds });
  // ページを離れるときも送れるよう keepalive を使う
  fetch("/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {
    for (const id of postIds) sent.delete(id);
  });
}

function enqueue(id: string) {
  if (sent.has(id) || queue.has(id)) return;
  queue.add(id);
  if (timer === null) timer = window.setTimeout(flush, 2500);
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** 要素が十分に表示されたら閲覧を記録する ref を返す */
export function useViewTracker(postId: string, enabled = true) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || sent.has(postId)) return;
    let t: number | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        const vh = window.innerHeight || 1;
        const visible = entries.some(
          (e) => e.isIntersecting && (e.intersectionRatio >= 0.6 || e.intersectionRect.height / vh >= 0.5),
        );
        if (visible && t === null) {
          t = window.setTimeout(() => {
            enqueue(postId);
            io.disconnect();
          }, 1500);
        } else if (!visible && t !== null) {
          window.clearTimeout(t);
          t = null;
        }
      },
      { threshold: [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (t !== null) window.clearTimeout(t);
    };
  }, [postId, enabled]);
  return ref;
}
