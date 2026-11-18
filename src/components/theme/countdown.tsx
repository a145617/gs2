"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/time";

/** 指定時刻までの残り時間（サーバー時刻とのずれ skew を考慮） */
export function Countdown({ target, skew = 0, className }: { target: string; skew?: number; className?: string }) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now() + skew);
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [skew]);
  const remaining = nowMs === null ? null : new Date(target).getTime() - nowMs;
  return (
    <span className={className} suppressHydrationWarning>
      {remaining === null ? "--:--:--" : formatCountdown(remaining)}
    </span>
  );
}
