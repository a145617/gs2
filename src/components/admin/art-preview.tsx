"use client";

import { useEffect, useRef } from "react";
import type { PixelArt } from "@/lib/pixel-art";

/** ピクセルアートの見本（マス目を色で塗った小さな絵） */
export function ArtPreview({ art, size = 160, className }: { art: PixelArt; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = art.w;
    canvas.height = art.h;
    for (let i = 0; i < art.cells.length; i++) {
      ctx.fillStyle = art.palette[art.cells[i]]?.hex ?? "#000";
      ctx.fillRect(i % art.w, Math.floor(i / art.w), 1, 1);
    }
  }, [art]);

  const scale = size / Math.max(art.w, art.h);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${art.w}×${art.h}マスの絵（${art.palette.map((p) => p.name).join("・")}）`}
      className={className}
      style={{ width: art.w * scale, height: art.h * scale, imageRendering: "pixelated", borderRadius: 10 }}
    />
  );
}

/** 絵に使う色の一覧 */
export function PaletteChips({ art }: { art: PixelArt }) {
  const counts = art.palette.map((_, i) => art.cells.filter((c) => c === i).length);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {art.palette.map((p, i) => (
        <li key={`${p.hex}-${i}`} className="neu-inset neu-sm flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[11px] text-ink-2">
          <span className="h-4 w-4 rounded-full" style={{ background: p.hex }} aria-hidden="true" />
          {p.name}
          <span className="text-ink-3">{counts[i]}</span>
        </li>
      ))}
    </ul>
  );
}
