"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import clsx from "clsx";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { PRESETS, PRESET_KEYS, type PixelArt } from "@/lib/pixel-art";
import { fromJstInputValue, toJstInputValue } from "@/lib/time";
import type { EventDTO } from "@/lib/types";
import { ArtPreview, PaletteChips } from "./art-preview";
import type { ArtPreviewResponse } from "./types";

type Fields = Record<string, string>;
const fieldsOf = (err: unknown): Fields =>
  err instanceof ApiError ? ((err.details as { fields?: Fields } | undefined)?.fields ?? {}) : {};

const clampInt = (v: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** 画像から作る絵の見本（サーバーで作るので、実際に開催される絵と同じになる） */
function useImageArt(file: File | null, size: number, colors: number) {
  const [state, setState] = useState<{ art: PixelArt | null; loading: boolean; error: string | null }>({
    art: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const form = new FormData();
      form.set("title", "プレビュー");
      form.set("source", "image");
      form.set("size", String(size));
      form.set("colors", String(colors));
      form.set("preview", "true");
      form.set("image", file);
      try {
        const res = await api<ArtPreviewResponse>("/api/admin/events", { method: "POST", body: form });
        if (!cancelled) setState({ art: res.art, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ art: null, loading: false, error: err instanceof ApiError ? err.message : "画像を読み込めませんでした" });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file, size, colors]);
  return file ? state : { art: null, loading: false, error: null };
}

/** イベントを開催する（用意された絵 / アップロードした画像から作る絵、今すぐ / 日時を指定） */
export function EventCreateForm({ serverNow, suggestedSize = 12, onCreated }: { serverNow: string; suggestedSize?: number; onCreated: () => void }) {
  const [source, setSource] = useState<"preset" | "image">("preset");
  const [preset, setPreset] = useState<string>(PRESET_KEYS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sizeText, setSizeText] = useState(String(suggestedSize));
  const [colorsText, setColorsText] = useState("6");
  const [threshold, setThreshold] = useState(25);
  const [timing, setTiming] = useState<"now" | "schedule">("now");
  const [startsAt, setStartsAt] = useState(() => toJstInputValue(new Date(new Date(serverNow).getTime() + 24 * 3600_000)));
  const [hoursText, setHoursText] = useState("72");
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const size = clampInt(sizeText, 4, 48, 12);
  const colors = clampInt(colorsText, 2, 12, 6);
  const presetArt = useMemo(() => PRESETS[preset].build(size, size), [preset, size]);
  const image = useImageArt(source === "image" ? file : null, size, colors);
  const art = source === "preset" ? presetArt : image.art;
  const effectiveTitle = title.trim() || (source === "preset" ? PRESETS[preset].name : "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const start = timing === "schedule" ? fromJstInputValue(startsAt) : null;
    if (timing === "schedule" && !start) {
      setErrors({ startsAt: "開始日時を入力してください" });
      return;
    }
    const common = {
      title: effectiveTitle,
      description,
      size: String(size),
      threshold: String(threshold / 100),
      hours: String(clampInt(hoursText, 1, 720, 72)),
      ...(start ? { startsAt: start } : {}),
    };
    setBusy(true);
    try {
      if (source === "image") {
        if (!file) throw new ApiError(400, "bad_request", "絵の元にする画像を選んでください");
        const form = new FormData();
        for (const [k, v] of Object.entries({ ...common, source: "image", colors: String(colors) })) form.set(k, v);
        form.set("image", file);
        await api("/api/admin/events", { method: "POST", body: form });
      } else {
        await api("/api/admin/events", {
          method: "POST",
          json: { ...common, source: "preset", preset, size, threshold: threshold / 100, hours: Number(common.hours) },
        });
      }
      toast.success(timing === "now" ? `イベント「${effectiveTitle}」を開始しました` : `イベント「${effectiveTitle}」を予約しました`);
      setTitle("");
      setDescription("");
      onCreated();
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "イベントを開催できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="event-create">
      <Segmented
        ariaLabel="絵の作り方"
        value={source}
        onChange={setSource}
        options={[
          { value: "preset", label: "用意された絵" },
          { value: "image", label: "画像から作る" },
        ]}
      />

      {source === "preset" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="絵の種類">
          {PRESET_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={preset === k}
              onClick={() => setPreset(k)}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-[16px] p-2 text-[11px]",
                preset === k ? "neu-inset neu-sm text-accent" : "neu neu-sm neu-convex neu-press text-ink-2",
              )}
            >
              <ArtPreview art={PRESETS[k].build(12, 12)} size={56} />
              {PRESETS[k].name}
            </button>
          ))}
        </div>
      ) : (
        <label className="neu-inset neu-sm flex cursor-pointer items-center gap-3 rounded-[16px] px-4 py-3 text-sm text-ink-2">
          <ImagePlus size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "絵の元にする画像を選ぶ（JPEG・PNG・WebP）"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="event-image-input"
          />
        </label>
      )}

      <div className="neu-inset neu-sm flex flex-col items-center gap-3 rounded-[20px] p-4" data-testid="event-art-preview">
        {art ? (
          <>
            <ArtPreview art={art} size={180} />
            <PaletteChips art={art} />
          </>
        ) : image.loading ? (
          <Spinner />
        ) : (
          <p className="py-6 text-sm text-ink-3">{image.error ?? "画像を選ぶと、ここに絵の見本が出ます"}</p>
        )}
        {image.loading && art && <p className="text-xs text-ink-3">更新中…</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          type="number"
          inputMode="numeric"
          label="マス目（一辺）"
          min={4}
          max={48}
          value={sizeText}
          onChange={(e) => setSizeText(e.target.value)}
          hint={`${size}×${size}＝${size * size}マス`}
          error={errors.size}
        />
        {source === "image" ? (
          <TextField
            type="number"
            inputMode="numeric"
            label="色の数"
            min={2}
            max={12}
            value={colorsText}
            onChange={(e) => setColorsText(e.target.value)}
            error={errors.colors}
          />
        ) : (
          <div />
        )}
      </div>
      <label className="flex flex-col gap-1.5 px-1">
        <span className="flex justify-between text-[13px] font-bold text-ink-2">
          合格ライン（写真の中の指定色の割合）<span className="text-accent tabular-nums">{threshold}%</span>
        </span>
        <input type="range" min={5} max={90} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="accent-[var(--accent)]" />
      </label>

      <TextField
        label="イベント名"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={40}
        placeholder={source === "preset" ? PRESETS[preset].name : "例: みんなの夏空"}
        error={errors.title}
        data-testid="event-title"
      />
      <TextArea
        label="説明（任意）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder="例: 青い色の写真を集めて、夏の空を完成させよう"
        error={errors.description}
      />

      <Segmented
        ariaLabel="開始のタイミング"
        value={timing}
        onChange={setTiming}
        options={[
          { value: "now", label: "今すぐ開始" },
          { value: "schedule", label: "日時を指定" },
        ]}
      />
      {timing === "schedule" && (
        <TextField
          type="datetime-local"
          label="開始日時（日本時間）"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          error={errors.startsAt}
          hint="開始すると全員にお知らせが届きます"
        />
      )}
      <TextField
        type="number"
        inputMode="numeric"
        label="開催期間（時間）"
        min={1}
        max={720}
        value={hoursText}
        onChange={(e) => setHoursText(e.target.value)}
        hint="72時間＝3日間、168時間＝1週間"
        error={errors.hours}
      />
      {timing === "now" && <p className="px-1 text-xs text-ink-3">開催中のイベントがあれば終了し、新しいイベントに切り替わります。</p>}
      <Button type="submit" variant="accent" loading={busy} disabled={!effectiveTitle || (source === "image" && !image.art)} data-testid="event-submit">
        {timing === "now" ? "このイベントを今すぐ開始する" : "このイベントを予約する"}
      </Button>
    </form>
  );
}

/** イベントの名前・説明・終了日時の変更 */
export function EventEditForm({ event, onSaved, onCancel }: { event: EventDTO; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [endsAt, setEndsAt] = useState(toJstInputValue(event.endsAt));
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const end = fromJstInputValue(endsAt);
    setBusy(true);
    try {
      await api(`/api/admin/events/${event.id}`, { method: "PATCH", json: { title, description, ...(end ? { endsAt: end } : {}) } });
      toast.success("イベントを変更しました");
      onSaved();
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField label="イベント名" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} error={errors.title} />
      <TextArea label="説明" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} error={errors.description} />
      <TextField
        type="datetime-local"
        label="終了日時（日本時間）"
        value={endsAt}
        onChange={(e) => setEndsAt(e.target.value)}
        hint="期間の延長・短縮ができます"
        error={errors.endsAt}
      />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          戻る
        </Button>
        <Button type="submit" variant="accent" className="flex-1" loading={busy}>
          保存する
        </Button>
      </div>
    </form>
  );
}
