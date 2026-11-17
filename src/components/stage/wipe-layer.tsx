"use client";

import { useEffect, useRef } from "react";

// 写真の上にかかる「曇り」「霧」の層。指でなぞると拭き取れ、しばらくすると少しずつ戻ってくる。

type Props = {
  kind: "condensation" | "fog";
  /** 縦方向のスクロールを優先するか（フィードでは true。指を横に動かすと拭ける） */
  allowScroll?: boolean;
};

function makeDroplets(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(233, 240, 247, 0.6)";
  ctx.fillRect(0, 0, w, h);
  // 細かな水滴
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 2.4 + 0.6;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(190,205,220,0.25)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function makeClouds(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w * 2;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(236, 238, 244, 0.55)";
  ctx.fillRect(0, 0, c.width, h);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * h;
    const r = (Math.random() * 0.25 + 0.12) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(250,250,253,0.55)");
    g.addColorStop(1, "rgba(250,250,253,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

export function WipeLayer({ kind, allowScroll = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let texture: HTMLCanvasElement | null = null;
    const mask = document.createElement("canvas");
    const mctx = mask.getContext("2d")!;
    let raf = 0;
    let visible = false;
    let last = performance.now();
    const start = last;

    const setup = () => {
      const nw = Math.max(1, Math.round(canvas.clientWidth * scale));
      const nh = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      mask.width = w;
      mask.height = h;
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, w, h);
      texture = kind === "condensation" ? makeDroplets(w, h) : makeClouds(w, h);
    };

    const render = (now: number) => {
      if (!texture) return;
      const dt = Math.min(100, now - last);
      last = now;
      // 少しずつ曇り（霧）が戻ってくる
      mctx.globalCompositeOperation = "source-over";
      mctx.globalAlpha = (kind === "fog" ? 0.0022 : 0.0016) * (dt / 16);
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, w, h);
      mctx.globalAlpha = 1;

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      if (kind === "fog") {
        const shift = (((now - start) / 1000) * 12 * scale) % w;
        ctx.drawImage(texture, -shift, 0);
        ctx.drawImage(texture, w * 2 - shift, 0);
      } else {
        ctx.drawImage(texture, 0, 0);
      }
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      render(now);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    };

    setup();
    render(performance.now());

    const io = new IntersectionObserver((e) => {
      visible = e.some((x) => x.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      setup();
      render(performance.now());
    });
    ro.observe(canvas);

    let lastPoint: [number, number] | null = null;
    const wipe = (x: number, y: number) => {
      const r = Math.max(w, h) * 0.09;
      mctx.globalCompositeOperation = "destination-out";
      const pts: [number, number][] = [];
      if (lastPoint) {
        const steps = Math.ceil(Math.hypot(x - lastPoint[0], y - lastPoint[1]) / (r * 0.4));
        for (let i = 1; i <= steps; i++) pts.push([lastPoint[0] + ((x - lastPoint[0]) * i) / steps, lastPoint[1] + ((y - lastPoint[1]) * i) / steps]);
      } else pts.push([x, y]);
      for (const [px, py] of pts) {
        const g = mctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, "rgba(0,0,0,0.9)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = g;
        mctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
      mctx.globalCompositeOperation = "source-over";
      lastPoint = [x, y];
      if (reduce || !visible) render(performance.now());
    };
    const pos = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [((e.clientX - rect.left) / rect.width) * w, ((e.clientY - rect.top) / rect.height) * h];
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.buttons > 0 || e.pointerType === "touch" || e.pointerType === "pen") wipe(...pos(e));
    };
    const onUp = () => (lastPoint = null);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [kind]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: allowScroll ? "pan-y" : "none" }}
      aria-hidden="true"
      data-testid={`wipe-${kind}`}
    />
  );
}
