"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { Hand } from "lucide-react";
import { EffectCanvas } from "./effect-canvas";
import { KALEIDO, MONITOR, PRISM, SPLASH, WATER } from "./shaders";
import { WipeLayer } from "./wipe-layer";
import { hexToRgb } from "@/lib/color";
import type { TemplateKey } from "@/lib/templates";

// =============================================================================
// お題ごとの表示テンプレート（仕様: 各投稿はそのお題にあった方法によって日ごとに異なって表示される）
// 例: 「空」の日は窓枠の中に写真がはめ込まれ、窓越しに空を見ているような雰囲気になる。
// =============================================================================

export type StageProps = {
  template: TemplateKey;
  accent: string;
  src: string;
  width: number;
  height: number;
  title: string;
  authorName: string;
  dayLabel?: string;
  /** フィードではスクロールを優先し、詳細画面では指での操作を優先する */
  variant?: "card" | "detail";
};

function Figure({ hint, children, template }: { hint?: string; children: ReactNode; template: TemplateKey }) {
  return (
    <figure className="flex flex-col gap-2" data-testid="theme-stage" data-template={template}>
      {children}
      {hint && (
        <figcaption className="flex items-center justify-center gap-1 text-[11px] text-ink-3">
          <Hand size={12} />
          {hint}
        </figcaption>
      )}
    </figure>
  );
}

function Photo({ src, alt, style, className }: { src: string; alt: string; style?: CSSProperties; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={clsx("absolute inset-0 h-full w-full object-cover select-none", className)}
      style={style}
    />
  );
}

/** 写真の縦横比（極端な縦長・横長は少し抑える） */
function ratioOf(w: number, h: number) {
  return Math.min(1.9, Math.max(0.66, w / h));
}

// ------------------------------------------------------------------ 窓
const SASH = "linear-gradient(145deg, #fbf8f2, #ddd6ca)";
function WindowStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  return (
    <Figure template="window" hint="指で窓の曇りを拭えます">
      <div
        className="rounded-[22px] p-[11px]"
        style={{
          background: SASH,
          boxShadow:
            "7px 7px 16px var(--sh-dark), -7px -7px 16px var(--sh-light), inset 0 1px 0 rgba(255,255,255,.8), inset 0 -2px 0 rgba(0,0,0,.08)",
        }}
      >
        <div
          className="relative overflow-hidden rounded-[8px]"
          style={{ aspectRatio: String(r), boxShadow: "inset 0 0 0 2px rgba(0,0,0,.08), inset 0 8px 16px rgba(0,0,0,.25)" }}
        >
          <Photo src={p.src} alt={p.title} />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,.34) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 58%, rgba(255,255,255,.14) 66%, rgba(255,255,255,0) 74%)",
              transform: "translateX(calc(var(--lx) * 6%))",
            }}
          />
          <WipeLayer kind="condensation" allowScroll={p.variant !== "detail"} />
          {/* 窓の桟 */}
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[9px] -translate-x-1/2"
            style={{ background: SASH, boxShadow: "3px 0 6px rgba(0,0,0,.22), -1px 0 0 rgba(255,255,255,.7)" }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-[9px] -translate-y-1/2"
            style={{ background: SASH, boxShadow: "0 3px 6px rgba(0,0,0,.22), 0 -1px 0 rgba(255,255,255,.7)" }}
          />
        </div>
        <div className="mx-[-11px] mt-[11px] mb-[-11px] h-3 rounded-b-[22px]" style={{ background: "linear-gradient(#e6e0d5, #cfc7b8)" }} />
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ 額縁
const GOLD =
  "linear-gradient(135deg, #7a5a1c 0%, #e8c96a 22%, #9c7426 45%, #f3dc8c 68%, #8a6420 88%, #d8b45a 100%)";
function GalleryStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  return (
    <Figure template="gallery">
      <div className="relative overflow-hidden rounded-[22px] px-[7%] pt-8 pb-5" style={{ background: "var(--gallery-wall)" }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-48 w-[80%] -translate-x-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,244,214,.55), rgba(255,244,214,0) 70%)",
            transform: "translateX(calc(-50% + var(--lx) * 4%))",
          }}
        />
        <div
          className="relative p-[11px]"
          style={{
            background: GOLD,
            boxShadow:
              "0 22px 32px -14px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.35), inset 0 0 0 4px rgba(110,78,20,.35)",
          }}
        >
          <div className="p-[7%]" style={{ background: "#f7f4ec", boxShadow: "inset 2px 2px 7px rgba(0,0,0,.2)" }}>
            <div className="relative" style={{ aspectRatio: String(r), boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}>
              <Photo src={p.src} alt={p.title} />
            </div>
          </div>
        </div>
        <div
          className="relative mx-auto mt-5 w-fit max-w-[80%] rounded-[3px] px-4 py-1.5 text-center"
          style={{ background: "linear-gradient(145deg, #ead79d, #b8944a)", boxShadow: "0 3px 6px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.5)" }}
        >
          <p className="font-display truncate text-[13px] font-bold text-[#3b2a0c]">{p.title}</p>
          <p className="truncate text-[10px] text-[#5a4316]">
            {p.authorName}
            {p.dayLabel ? ` ・ ${p.dayLabel}` : ""}
          </p>
        </div>
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ フィルム
function FilmStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  const sprockets: CSSProperties = {
    background: "repeating-linear-gradient(90deg, transparent 0 9px, #efe7d6 9px 22px, transparent 22px 31px)",
    opacity: 0.88,
  };
  return (
    <Figure template="film">
      <div className="relative overflow-hidden rounded-[18px] px-3 py-8" style={{ background: "#1b1714" }}>
        <div className="absolute inset-x-2 top-[10px] h-[11px] rounded-[2px]" style={sprockets} />
        <div className="absolute inset-x-2 bottom-[10px] h-[11px] rounded-[2px]" style={sprockets} />
        <div className="relative overflow-hidden rounded-[3px]" style={{ aspectRatio: String(r) }}>
          <Photo src={p.src} alt={p.title} style={{ filter: "sepia(.16) saturate(1.1) contrast(1.05) brightness(1.02)" }} />
          <div className="film-grain pointer-events-none absolute inset-0" />
          <div className="film-leak pointer-events-none absolute inset-0" />
        </div>
        <p className="absolute bottom-[25px] left-4 font-mono text-[9px] tracking-[0.25em] text-[#e8a23a]">HITOKOMA 400 ▸ 12A</p>
        <p className="absolute top-[24px] right-4 font-mono text-[9px] tracking-[0.25em] text-[#e8a23a]/80">{p.dayLabel ?? ""}</p>
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ 暗闇（スポットライト）
function DarkStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  const ref = useRef<HTMLDivElement>(null);
  const touched = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = false;
    const start = performance.now();
    const loop = (now: number) => {
      // しばらく触れていなければ、光がゆっくりさまよう
      if (now - touched.current > 2500) {
        const t = (now - start) / 1000;
        el.style.setProperty("--sx", `${50 + 32 * Math.sin(t * 0.45)}%`);
        el.style.setProperty("--sy", `${50 + 26 * Math.sin(t * 0.31 + 1)}%`);
      }
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((e) => {
      visible = e.some((x) => x.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    touched.current = performance.now();
    e.currentTarget.style.setProperty("--sx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    e.currentTarget.style.setProperty("--sy", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };
  return (
    <Figure template="dark" hint="指を置いた所が照らされます">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-[22px]"
        style={{ aspectRatio: String(r), ["--sx" as string]: "50%", ["--sy" as string]: "45%", background: "#05060c", touchAction: p.variant === "detail" ? "none" : "pan-y" }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        <Photo src={p.src} alt={p.title} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at var(--sx) var(--sy), rgba(4,5,10,0) 0, rgba(4,5,10,0) 14%, rgba(4,5,10,.55) 26%, rgba(4,5,10,.93) 42%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{ background: `radial-gradient(circle at var(--sx) var(--sy), color-mix(in oklab, ${p.accent} 35%, transparent), transparent 22%)` }}
        />
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ 和紙
const WASHI_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.07' numOctaves='3' seed='7'/><feDisplacementMap in='SourceGraphic' scale='7'/><feGaussianBlur stdDeviation='0.5'/></filter><rect x='5' y='5' width='90' height='90' fill='white' filter='url(#f)'/></svg>",
)}")`;
function WashiStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  const initial = (p.authorName || "?").trim().slice(0, 1);
  return (
    <Figure template="washi">
      <div className="washi-paper flex gap-3 rounded-[22px] p-4">
        <div className="relative flex-1" style={{ aspectRatio: String(r) }}>
          <Photo
            src={p.src}
            alt={p.title}
            style={{ maskImage: WASHI_MASK, WebkitMaskImage: WASHI_MASK, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}
          />
        </div>
        <div className="flex w-9 shrink-0 flex-col items-center justify-between py-1">
          <span className="font-display text-[17px] tracking-[0.25em] text-[#3a3530]" style={{ writingMode: "vertical-rl" }}>
            {p.title}
          </span>
          <span
            className="font-display mt-2 flex h-8 w-8 items-center justify-center rounded-[4px] text-[15px] font-bold text-[#c23a2b]"
            style={{ border: "2px solid #c23a2b", transform: "rotate(-4deg)", opacity: 0.88 }}
            aria-label={`${p.authorName}の印`}
          >
            {initial}
          </span>
        </div>
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ チェキ（揺れる）
function InstantStage(p: StageProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let angle = 0;
    let vel = 0;
    let target = 0;
    let lastScroll = window.scrollY;
    let raf = 0;
    let visible = false;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const lx = Number(getComputedStyle(document.documentElement).getPropertyValue("--lx")) || -0.7;
      target = (lx + 0.7) * 4;
      const sy = window.scrollY;
      vel += Math.max(-40, Math.min(40, sy - lastScroll)) * 0.02;
      lastScroll = sy;
      // ばね（揺れて、だんだん止まる）
      vel += (target - angle) * 18 * dt;
      vel *= Math.pow(0.12, dt);
      angle += vel * dt * 6;
      angle = Math.max(-8, Math.min(8, angle));
      el.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((e) => {
      visible = e.some((x) => x.isIntersecting);
      cancelAnimationFrame(raf);
      if (visible) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <Figure template="instant" hint="傾けたりスクロールすると揺れます">
      <div className="relative overflow-hidden rounded-[22px] px-6 pt-4 pb-6" style={{ background: "var(--instant-wall)" }}>
        <svg className="pointer-events-none absolute inset-x-0 top-3 h-6 w-full" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 2 Q50 9 100 2" fill="none" stroke="rgba(110,90,70,.55)" strokeWidth="0.5" />
        </svg>
        <div ref={cardRef} className="relative mx-auto mt-4 w-[86%] origin-top" style={{ transform: "rotate(0deg)" }}>
          <div
            className="absolute -top-4 left-1/2 z-10 h-7 w-3 -translate-x-1/2 rounded-[3px]"
            style={{ background: "linear-gradient(90deg,#c9a26b,#a57d47)", boxShadow: "0 2px 3px rgba(0,0,0,.3)" }}
            aria-hidden="true"
          />
          <div className="rounded-[4px] p-3 pb-12" style={{ background: "#fbfaf6", boxShadow: "0 14px 24px -10px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.15)" }}>
            <div className="relative aspect-square overflow-hidden" style={{ boxShadow: "inset 0 0 6px rgba(0,0,0,.25)" }}>
              <Photo src={p.src} alt={p.title} style={{ filter: "saturate(1.08) contrast(.96) brightness(1.04)" }} />
            </div>
            <p className="font-display absolute right-4 bottom-3 left-4 truncate text-center text-[15px] text-[#4a4038]" style={{ transform: "rotate(-1.5deg)" }}>
              {p.title}
            </p>
          </div>
        </div>
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ 霧
function FogStage(p: StageProps) {
  const r = ratioOf(p.width, p.height);
  return (
    <Figure template="fog" hint="指で霧を拭えます">
      <div className="relative overflow-hidden rounded-[22px]" style={{ aspectRatio: String(r) }}>
        <Photo src={p.src} alt={p.title} style={{ filter: "saturate(.9) brightness(1.03)" }} />
        <WipeLayer kind="fog" allowScroll={p.variant !== "detail"} />
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ WebGL のもの
function GlStage({ p, fragment, hint, uniforms, frame }: { p: StageProps; fragment: string; hint?: string; uniforms?: () => Record<string, number | [number, number, number]>; frame?: "monitor" | "water" }) {
  const r = ratioOf(p.width, p.height);
  const canvas = (
    <EffectCanvas
      src={p.src}
      fragment={fragment}
      aspect={r}
      alt={p.title}
      uniforms={uniforms}
      className={frame === "monitor" ? "rounded-[16px]" : "rounded-[22px]"}
    />
  );
  return (
    <Figure template={p.template} hint={hint}>
      {frame === "monitor" ? (
        <div
          className="rounded-[26px] p-3.5"
          style={{
            background: "linear-gradient(145deg,#3b4048,#1d2127)",
            boxShadow: "7px 7px 16px var(--sh-dark), -5px -5px 14px var(--sh-light), inset 0 1px 0 rgba(255,255,255,.12)",
          }}
        >
          <div className="overflow-hidden rounded-[16px]" style={{ boxShadow: "inset 0 0 26px rgba(0,0,0,.85)" }}>
            {canvas}
          </div>
          <div className="mt-2.5 flex items-center justify-between px-2">
            <span className="text-[9px] tracking-[0.35em] text-white/40">HITOKOMA</span>
            <span className="h-2 w-2 rounded-full bg-[#5dff9b] shadow-[0_0_8px_#5dff9b]" />
          </div>
        </div>
      ) : frame === "water" ? (
        <div className="rounded-[26px] p-1.5" style={{ background: "linear-gradient(160deg, rgba(120,190,220,.35), rgba(40,90,130,.25))" }}>
          {canvas}
        </div>
      ) : (
        canvas
      )}
    </Figure>
  );
}

/** お題の表示テンプレートに合わせて写真を表示する */
export function ThemeStage(p: StageProps) {
  const target = useMemo(() => {
    const [r, g, b] = hexToRgb(p.accent);
    return [r / 255, g / 255, b / 255] as [number, number, number];
  }, [p.accent]);
  switch (p.template) {
    case "window":
      return <WindowStage {...p} />;
    case "gallery":
      return <GalleryStage {...p} />;
    case "film":
      return <FilmStage {...p} />;
    case "water":
      return <GlStage p={p} fragment={WATER} hint="触れると波紋が広がります" frame="water" />;
    case "splash":
      return <GlStage p={p} fragment={SPLASH} hint="お題の色だけが残ります（触れた所は色が戻ります）" uniforms={() => ({ u_target: target })} />;
    case "dark":
      return <DarkStage {...p} />;
    case "washi":
      return <WashiStage {...p} />;
    case "kaleido":
      return <GlStage p={p} fragment={KALEIDO} hint="指を左右に動かすと模様が回ります" />;
    case "instant":
      return <InstantStage {...p} />;
    case "prism":
      return <GlStage p={p} fragment={PRISM} hint="指を動かすと光の帯が動きます" />;
    case "monitor":
      return <GlStage p={p} fragment={MONITOR} frame="monitor" />;
    case "fog":
      return <FogStage {...p} />;
    default:
      return null;
  }
}
