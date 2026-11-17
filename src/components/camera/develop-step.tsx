"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, RotateCw, Undo2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  computeOutput,
  DEFAULT_ADJUSTMENTS,
  Developer,
  exportDeveloped,
  exportPlain,
  loadBitmap,
  type Adjustments,
  type DevelopSource,
  type Geometry,
} from "@/lib/client/develop";
import { CAPTURE_MODE_LABEL, formatPhotoMeta } from "@/lib/photo-meta";
import type { Captured } from "./capture-step";

export type Developed = { blob: Blob; width: number; height: number };

type Tab = "light" | "color" | "effect" | "crop";

const SLIDERS: Record<Exclude<Tab, "crop">, { key: keyof Adjustments; label: string; min: number; max: number; step: number }[]> = {
  light: [
    { key: "exposure", label: "露出", min: -3, max: 3, step: 0.05 },
    { key: "contrast", label: "コントラスト", min: -1, max: 1, step: 0.02 },
    { key: "highlights", label: "ハイライト", min: -1, max: 1, step: 0.02 },
    { key: "shadows", label: "シャドウ", min: -1, max: 1, step: 0.02 },
  ],
  color: [
    { key: "temperature", label: "色温度", min: -1, max: 1, step: 0.02 },
    { key: "tint", label: "色かぶり", min: -1, max: 1, step: 0.02 },
    { key: "saturation", label: "彩度", min: -1, max: 1, step: 0.02 },
  ],
  effect: [{ key: "vignette", label: "周辺減光", min: 0, max: 1, step: 0.02 }],
};

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "元のまま", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:4", value: 3 / 4 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

function formatValue(key: keyof Adjustments, v: number) {
  if (key === "exposure") return `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`;
  return `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;
}

/** 現像画面（RAW・撮影した写真の露出や色を調整する） */
export function DevelopStep({
  captured,
  onBack,
  onDone,
}: {
  captured: Captured;
  onBack: () => void;
  onDone: (d: Developed) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const devRef = useRef<Developer | null>(null);
  const [source, setSource] = useState<DevelopSource | null>(null);
  const [supported] = useState(() => Developer.isSupported());
  const [adj, setAdj] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [geo, setGeo] = useState<Geometry>({ rotation: 0, aspect: null });
  const [tab, setTab] = useState<Tab>("light");
  const [compare, setCompare] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();

  // 現像の元になる画像を用意する
  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    (async () => {
      try {
        if (captured.raw?.kind === "linear") {
          const r = captured.raw;
          if (!cancelled) setSource({ kind: "linear", data: r.data, width: r.width, height: r.height });
          return;
        }
        const blob = captured.blob ?? (captured.raw?.kind === "jpeg" ? captured.raw.blob : null);
        if (!blob) throw new Error("画像がありません");
        bitmap = await loadBitmap(blob, 4096);
        if (!cancelled) setSource({ kind: "bitmap", image: bitmap, width: bitmap.width, height: bitmap.height });
      } catch {
        if (!cancelled) setLoadError("この画像は読み込めませんでした（HEICなどの場合はJPEGで保存してからお試しください）");
      }
    })();
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [captured]);

  // WebGL の準備
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || !supported) return;
    try {
      const dev = new Developer(canvas);
      dev.setSource(source);
      devRef.current = dev;
      return () => {
        dev.destroy();
        devRef.current = null;
      };
    } catch {
      const id = window.setTimeout(() => setLoadError("この端末では現像機能を使えません"), 0);
      return () => window.clearTimeout(id);
    }
  }, [source, supported]);

  const preview = useMemo(() => {
    if (!source) return null;
    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    return computeOutput(source, geo, Math.round(560 * dpr));
  }, [source, geo]);

  // 調整のたびに描き直す
  useEffect(() => {
    const dev = devRef.current;
    if (!dev || !preview) return;
    const id = requestAnimationFrame(() => dev.draw(compare ? DEFAULT_ADJUSTMENTS : adj, geo, preview.width, preview.height));
    return () => cancelAnimationFrame(id);
  }, [adj, geo, preview, compare, source]);

  async function finish() {
    if (!source) return;
    setExporting(true);
    try {
      const out =
        supported
          ? await exportDeveloped(source, adj, geo)
          : await exportPlain((source as Extract<DevelopSource, { kind: "bitmap" }>).image as ImageBitmap);
      onDone(out);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  }

  const metaLine = formatPhotoMeta({ mode: captured.mode, ...captured.meta });

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="neu rounded-2xl p-4 text-sm text-danger">{loadError}</p>
        <Button onClick={onBack} icon={<ChevronLeft size={16} />}>
          撮り直す
        </Button>
      </div>
    );
  }
  if (!source) return <PageSpinner label="写真を準備しています…" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <IconButton label="撮り直す" onClick={onBack}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-ink">{captured.mode === "raw" ? "RAW現像" : "現像"}</h1>
          <p className="truncate text-xs text-ink-3">
            {CAPTURE_MODE_LABEL[captured.mode]}
            {metaLine.length > 0 && ` ・ ${metaLine.join(" ・ ")}`}
            {captured.meta.rawPreview && " ・ 埋め込みプレビューから現像"}
          </p>
        </div>
        <IconButton label="調整をリセット" onClick={() => setAdj(DEFAULT_ADJUSTMENTS)}>
          <Undo2 size={18} />
        </IconButton>
      </div>

      <div
        className="neu-inset flex items-center justify-center overflow-hidden rounded-[22px] p-3"
        onPointerDown={() => setCompare(true)}
        onPointerUp={() => setCompare(false)}
        onPointerLeave={() => setCompare(false)}
        onPointerCancel={() => setCompare(false)}
      >
        {supported ? (
          <canvas
            ref={canvasRef}
            data-testid="develop-canvas"
            className="max-h-[52dvh] max-w-full rounded-xl"
            style={{ aspectRatio: preview ? `${preview.width} / ${preview.height}` : undefined }}
            aria-label="現像のプレビュー（押している間は調整前を表示）"
          />
        ) : (
          <p className="p-6 text-sm text-ink-2">この端末では現像の調整ができません。このまま次へ進めます。</p>
        )}
      </div>
      {supported && <p className="-mt-2 text-center text-[11px] text-ink-3">写真を押している間は調整前の状態を表示します</p>}

      {supported && (
        <div className="neu flex flex-col gap-4 rounded-[22px] p-4">
          <Segmented<Tab>
            ariaLabel="調整の種類"
            value={tab}
            onChange={setTab}
            options={[
              { value: "light", label: "光" },
              { value: "color", label: "色" },
              { value: "effect", label: "効果" },
              { value: "crop", label: "切り抜き" },
            ]}
          />
          {tab === "crop" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {ASPECTS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => setGeo((g) => ({ ...g, aspect: a.value }))}
                    aria-pressed={geo.aspect === a.value}
                    className={clsx(
                      "h-9 rounded-full px-4 text-sm",
                      geo.aspect === a.value ? "neu-inset neu-sm font-bold text-accent" : "neu neu-sm neu-convex text-ink-2",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                icon={<RotateCw size={15} />}
                onClick={() => setGeo((g) => ({ ...g, rotation: (((g.rotation + 1) % 4) as Geometry["rotation"]) }))}
              >
                90°回転
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {SLIDERS[tab].map((s) => (
                <label key={s.key} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between px-1 text-xs font-bold text-ink-2">
                    {s.label}
                    <button
                      type="button"
                      className="font-normal text-ink-3 tabular-nums"
                      onClick={() => setAdj((a) => ({ ...a, [s.key]: DEFAULT_ADJUSTMENTS[s.key] }))}
                      aria-label={`${s.label}を元に戻す`}
                    >
                      {formatValue(s.key, adj[s.key])}
                    </button>
                  </span>
                  <input
                    type="range"
                    className="neu-range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={adj[s.key]}
                    aria-label={s.label}
                    onChange={(e) => setAdj((a) => ({ ...a, [s.key]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <Button variant="accent" size="lg" loading={exporting} onClick={finish} data-testid="develop-next">
        次へ
      </Button>
    </div>
  );
}
