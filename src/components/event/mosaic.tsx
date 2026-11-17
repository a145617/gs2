"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { EventCellDTO, EventDTO } from "@/lib/types";

/**
 * イベントのピクセルアート。
 * 埋まったマスは写真（担当色に染めて表示）、空いているマスは目標の色をうっすら表示する。
 * 指でつまんで拡大・ドラッグで移動、マスをタップするとその写真を開く。
 */
export function Mosaic({
  event,
  cells,
  highlightColor,
  onCellTap,
}: {
  event: EventDTO;
  cells: EventCellDTO[];
  highlightColor?: number | null;
  onCellTap?: (cell: EventCellDTO) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number; moved: boolean; lastX: number; lastY: number } | null>(null);
  const [tilesVersion, setTilesVersion] = useState(0);
  const tiles = useRef(new Map<number, HTMLImageElement>());

  const aspect = event.gridW / event.gridH;
  const colorOf = useMemo(() => event.palette.map((p) => p.hex), [event.palette]);

  // 写真（小さな画像）を読み込む
  useEffect(() => {
    let pending = 0;
    for (const c of cells) {
      if (!c.tile || tiles.current.has(c.i)) continue;
      const img = new Image();
      pending++;
      img.onload = img.onerror = () => {
        pending--;
        if (pending % 20 === 0 || pending === 0) setTilesVersion((v) => v + 1);
      };
      img.src = c.tile;
      tiles.current.set(c.i, img);
    }
  }, [cells]);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = wrap.clientWidth;
      const cell = Math.max(6, Math.ceil((cssW * dpr * 2) / event.gridW));
      const w = cell * event.gridW;
      const h = cell * event.gridH;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      for (const c of cells) {
        const x = (c.i % event.gridW) * cell;
        const y = Math.floor(c.i / event.gridW) * cell;
        const hex = colorOf[c.c] ?? "#888";
        const img = c.tile ? tiles.current.get(c.i) : undefined;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
          ctx.drawImage(img, x, y, cell, cell);
          // 写真の明るさを残したまま、担当色に染める
          ctx.globalCompositeOperation = "color";
          ctx.globalAlpha = 0.72;
          ctx.fillStyle = hex;
          ctx.fillRect(x, y, cell, cell);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        } else if (c.postId) {
          ctx.fillStyle = hex;
          ctx.fillRect(x, y, cell, cell);
        } else {
          const mine = highlightColor !== null && highlightColor !== undefined && c.c === highlightColor;
          ctx.globalAlpha = mine ? 0.42 : 0.17;
          ctx.fillStyle = hex;
          ctx.fillRect(x, y, cell, cell);
          ctx.globalAlpha = mine ? 0.9 : 0.35;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, Math.max(1, cell * (mine ? 0.16 : 0.08)), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // マスの境目
      if (cell >= 10) {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < event.gridW; i++) {
          ctx.moveTo(i * cell + 0.5, 0);
          ctx.lineTo(i * cell + 0.5, h);
        }
        for (let j = 1; j < event.gridH; j++) {
          ctx.moveTo(0, j * cell + 0.5);
          ctx.lineTo(w, j * cell + 0.5);
        }
        ctx.stroke();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [cells, colorOf, event.gridW, event.gridH, highlightColor, tilesVersion]);

  function clampView(v: { scale: number; x: number; y: number }) {
    const wrap = wrapRef.current;
    if (!wrap) return v;
    const scale = Math.min(8, Math.max(1, v.scale));
    const maxX = ((scale - 1) * wrap.clientWidth) / 2;
    const maxY = ((scale - 1) * wrap.clientHeight) / 2;
    return { scale, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      startDist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      startScale: view.scale,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length >= 2 && g.startDist > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView((v) => clampView({ ...v, scale: g.startScale * (d / g.startDist) }));
      g.moved = true;
      return;
    }
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    if (view.scale > 1) setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved || !onCellTap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * event.gridW);
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * event.gridH);
    if (cx < 0 || cy < 0 || cx >= event.gridW || cy >= event.gridH) return;
    const cell = cells[cy * event.gridW + cx];
    if (cell) onCellTap(cell);
  }

  const zoom = (factor: number) => setView((v) => clampView({ ...v, scale: v.scale * factor }));

  return (
    <div className="relative">
      <div
        ref={wrapRef}
        className="neu-inset relative overflow-hidden rounded-[20px] p-0"
        style={{ aspectRatio: String(aspect), touchAction: view.scale > 1 ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
          zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        onDoubleClick={() => setView((v) => (v.scale > 1 ? { scale: 1, x: 0, y: 0 } : clampView({ ...v, scale: 3 })))}
        data-testid="mosaic"
        role="img"
        aria-label={`ピクセルアート「${event.title}」（${event.filledCells} / ${event.totalCells} マス）`}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full origin-center"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, imageRendering: view.scale > 2 ? "pixelated" : "auto" }}
        />
      </div>
      <div className="absolute right-2 bottom-2 flex gap-1.5">
        <button type="button" aria-label="拡大" onClick={() => zoom(1.5)} className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink-2">
          <Plus size={15} />
        </button>
        <button type="button" aria-label="縮小" onClick={() => zoom(1 / 1.5)} className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink-2">
          <Minus size={15} />
        </button>
        <button type="button" aria-label="全体を表示" onClick={() => setView({ scale: 1, x: 0, y: 0 })} className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink-2">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
