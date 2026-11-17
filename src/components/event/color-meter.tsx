"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { colorCoverage } from "@/lib/color";

/** 撮影画面に重ねて、指定の色が画面の何%を占めているかをリアルタイムで表示する */
export function ColorMeter({
  video,
  hex,
  name,
  threshold,
  deltaE,
}: {
  video: HTMLVideoElement | null;
  hex: string;
  name: string;
  threshold: number;
  deltaE: number;
}) {
  const [ratio, setRatio] = useState(0);
  useEffect(() => {
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 36;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const id = window.setInterval(() => {
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      setRatio(colorCoverage(data, 4, hex, deltaE));
    }, 400);
    return () => window.clearInterval(id);
  }, [video, hex, deltaE]);

  const ok = ratio >= threshold;
  const pct = Math.round(ratio * 100);
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3" data-testid="color-meter">
      <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2 text-white" style={{ background: "rgba(20,22,30,.45)" }}>
        <span className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white/70" style={{ background: hex }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="truncate">「{name}」が画面の</span>
            <span className="font-bold tabular-nums" data-testid="color-meter-value">
              {pct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, pct)}%`, background: ok ? "#5dd39e" : "#ffffff" }} />
          </div>
        </div>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ok ? "bg-[#3a9d6a]" : "bg-white/20"}`}
          aria-label={ok ? "合格" : `あと${Math.max(0, Math.round(threshold * 100) - pct)}%`}
        >
          {ok ? <Check size={15} /> : `${Math.round(threshold * 100)}`}
        </span>
      </div>
    </div>
  );
}
