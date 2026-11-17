"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { Aperture, Camera, Check, FileImage, ImageUp, SwitchCamera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  applyManual,
  capturePhoto,
  describeCameraError,
  detectCapabilities,
  isoOptions,
  openCamera,
  shutterOptions,
  type CameraCapabilities,
  type CameraError,
} from "@/lib/client/camera";
import { readPhotoMeta } from "@/lib/client/exif";
import { decodeRaw, isRawFile, RAW_EXTENSIONS, type RawResult } from "@/lib/client/raw";
import { formatShutter, type CaptureMode, type PhotoMeta } from "@/lib/photo-meta";

export type Captured = {
  blob: Blob | null;
  mode: CaptureMode;
  meta: Partial<PhotoMeta>;
  raw?: RawResult;
};

/** カメラの起動元を差し替えられるようにする（デバッグ用の疑似カメラなど） */
export type StreamFactory = (facing: "environment" | "user") => Promise<MediaStream>;

type Props = {
  header?: ReactNode;
  /** 映像の上に重ねる表示（イベントの色メーターなど）。video 要素を受け取る */
  overlay?: (video: HTMLVideoElement | null) => ReactNode;
  onCaptured: (c: Captured) => void;
  streamFactory?: StreamFactory;
  /** 疑似的な手動設定の対応状況（デバッグ用） */
  capabilityOverride?: (caps: CameraCapabilities) => CameraCapabilities;
};

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span
        className={clsx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
          ok ? "bg-ok" : "bg-[var(--text-3)]",
        )}
        aria-hidden="true"
      >
        {ok ? <Check size={12} /> : <X size={12} />}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-ink">
          {label}
          <span className={clsx("ml-2 text-xs font-medium", ok ? "text-ok" : "text-ink-3")}>
            {ok ? "手動で設定できます" : "この端末・ブラウザでは自動"}
          </span>
        </span>
        <span className="text-xs text-ink-3">{detail}</span>
      </span>
    </li>
  );
}

/**
 * 撮影画面に表示する「手動設定の対応状況」。
 * 仕様: 一部または全部が不可能な機種・ブラウザでは可能なものだけを有効にし、そのことを撮影画面で表示する。
 */
export function CapabilityPanel({ caps, cameraOn }: { caps: CameraCapabilities; cameraOn: boolean }) {
  const anyManual = !!caps.shutter || !!caps.iso;
  return (
    <section aria-label="手動設定の対応状況" className="glass rounded-[20px] px-4 py-3" data-testid="capability-panel">
      <ul className="flex flex-col">
        <StatusRow
          label="シャッタースピード"
          ok={!!caps.shutter}
          detail={
            caps.shutter
              ? `${formatShutter(caps.shutter.min / 10000)} 〜 ${formatShutter(caps.shutter.max / 10000)} の範囲で設定できます`
              : "端末が自動で決めます"
          }
        />
        <StatusRow
          label="ISO感度"
          ok={!!caps.iso}
          detail={caps.iso ? `ISO ${caps.iso.min} 〜 ${caps.iso.max} の範囲で設定できます` : "端末が自動で決めます"}
        />
        <StatusRow
          label="絞り（F値）"
          ok={false}
          detail="Webブラウザから絞りを変える方法がなく、多くのスマホのレンズは絞りが固定です。撮影後、写真の情報に記録された値を表示します。"
        />
        <StatusRow
          label="RAW撮影"
          ok={false}
          detail="ブラウザからはセンサーのRAWデータを取得できません。標準カメラで撮ったRAW（DNGなど）を「RAW」から取り込んで現像できます。"
        />
      </ul>
      {cameraOn && !anyManual && (
        <p className="mt-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-ink-2" role="status">
          この端末・ブラウザは手動設定に対応していないため、通常の撮影（オート）になります。
        </p>
      )}
    </section>
  );
}

function StopPicker<T extends number>({
  label,
  values,
  value,
  onChange,
  format,
}: {
  label: string;
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  const index = Math.max(0, values.indexOf(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between px-1 text-xs font-bold text-ink-2">
        {label}
        <span className="font-display text-base text-ink tabular-nums">{format(values[index])}</span>
      </span>
      <input
        type="range"
        className="neu-range"
        min={0}
        max={values.length - 1}
        step={1}
        value={index}
        aria-valuetext={format(values[index])}
        onChange={(e) => onChange(values[Number(e.target.value)])}
      />
    </label>
  );
}

export function CaptureStep({ header, overlay, onCaptured, streamFactory, capabilityOverride }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [capsVersion, setCapsVersion] = useState(0);
  const [manual, setManual] = useState(false);
  const [shutter, setShutter] = useState<number>(1 / 125);
  const [iso, setIso] = useState<number>(100);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const libraryRef = useRef<HTMLInputElement>(null);
  const rawRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  const track = stream?.getVideoTracks()[0] ?? null;

  // 手動設定の対応状況（映像が始まってから値が出る端末もあるので、そのたびに調べ直す）
  const caps = useMemo<CameraCapabilities>(() => {
    void capsVersion;
    const detected = detectCapabilities(track);
    return capabilityOverride ? capabilityOverride(detected) : detected;
  }, [track, capsVersion, capabilityOverride]);

  // カメラの起動と停止
  useEffect(() => {
    let cancelled = false;
    let current: MediaStream | null = null;
    (streamFactory ?? openCamera)(facing)
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        current = s;
        setError(null);
        setStream(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(typeof e === "string" ? (e as CameraError) : "unknown");
      });
    return () => {
      cancelled = true;
      current?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [facing, streamFactory]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) v.play().catch(() => {});
    const update = () => setCapsVersion((n) => n + 1);
    v.addEventListener("loadedmetadata", update);
    return () => v.removeEventListener("loadedmetadata", update);
  }, [stream]);

  const shutterValues = caps.shutter ? shutterOptions(caps.shutter) : [];
  const isoValues = caps.iso ? isoOptions(caps.iso) : [];

  // 手動設定の反映
  useEffect(() => {
    if (!track || (!caps.shutter && !caps.iso)) return;
    applyManual(track, caps, manual ? { shutterSec: shutter, iso } : null).catch(() => {
      toast.error("この設定は端末で使えませんでした");
    });
  }, [track, caps, manual, shutter, iso, toast]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy("撮影中…");
    try {
      const blob = await capturePhoto(video, track);
      const exif = await readPhotoMeta(blob);
      const meta: Partial<PhotoMeta> = { ...exif };
      if (manual) {
        if (caps.shutter) meta.exposureTime = shutter;
        if (caps.iso) meta.iso = iso;
      } else {
        const cur = detectCapabilities(track).current;
        if (!meta.exposureTime && cur.exposureTime) meta.exposureTime = cur.exposureTime / 10000;
        if (!meta.iso && cur.iso) meta.iso = Math.round(cur.iso);
      }
      onCaptured({ blob, mode: manual && (caps.shutter || caps.iso) ? "manual" : "auto", meta });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撮影に失敗しました");
    } finally {
      setBusy(null);
    }
  }, [track, manual, caps, shutter, iso, onCaptured, toast]);

  async function onFile(file: File | undefined, mode: CaptureMode) {
    if (!file) return;
    if (mode === "raw" || isRawFile(file)) {
      setBusy("RAWを展開しています…");
      try {
        const raw = await decodeRaw(file);
        onCaptured({ blob: raw.kind === "jpeg" ? raw.blob : null, mode: "raw", raw, meta: { ...raw.meta, rawFormat: file.name.split(".").pop()?.toUpperCase().slice(0, 10), rawPreview: raw.kind === "jpeg" } });
      } catch (e) {
        toast.error(`RAWを読み込めませんでした：${e instanceof Error ? e.message : ""}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    setBusy("読み込み中…");
    try {
      onCaptured({ blob: file, mode, meta: await readPhotoMeta(file) });
    } finally {
      setBusy(null);
    }
  }

  const cameraOn = !!stream && !error;

  return (
    <div className="flex flex-col gap-4">
      {header}
      <div className="neu-inset relative aspect-[3/4] w-full overflow-hidden rounded-[26px] bg-black/80">
        <video
          ref={(el) => {
            videoRef.current = el;
            setVideoEl(el);
          }}
          playsInline
          muted
          autoPlay
          className={clsx("h-full w-full object-cover", facing === "user" && "-scale-x-100")}
          aria-label="カメラの映像"
          data-testid="camera-video"
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-sm text-white/85">
            {error ? (
              <>
                <Camera size={30} />
                <p>{describeCameraError(error)}</p>
              </>
            ) : (
              <>
                <Spinner />
                <p>カメラを起動しています…</p>
              </>
            )}
          </div>
        )}
        {cameraOn && overlay?.(videoEl)}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm text-white">
            <Spinner />
            {busy}
          </div>
        )}
        {cameraOn && (
          <button
            type="button"
            onClick={() => setFacing(facing === "environment" ? "user" : "environment")}
            aria-label="カメラを切り替え"
            className="glass absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full text-white"
          >
            <SwitchCamera size={18} />
          </button>
        )}
      </div>

      {cameraOn && (caps.shutter || caps.iso) && (
        <div className="neu flex flex-col gap-3 rounded-[22px] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">露出</span>
            <div className="neu-inset neu-sm flex rounded-full p-1" role="radiogroup" aria-label="撮影モード">
              {[
                { v: false, label: "オート" },
                { v: true, label: "マニュアル" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={manual === o.v}
                  onClick={() => setManual(o.v)}
                  className={clsx(
                    "h-8 rounded-full px-4 text-xs font-bold",
                    manual === o.v ? "neu neu-sm neu-convex text-accent" : "text-ink-3",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {manual && (
            <div className="flex flex-col gap-3">
              {caps.shutter && shutterValues.length > 0 && (
                <StopPicker
                  label="シャッタースピード"
                  values={shutterValues}
                  value={shutterValues.includes(shutter) ? shutter : shutterValues[Math.floor(shutterValues.length / 2)]}
                  onChange={setShutter}
                  format={formatShutter}
                />
              )}
              {caps.iso && isoValues.length > 0 && (
                <StopPicker
                  label="ISO感度"
                  values={isoValues}
                  value={isoValues.includes(iso) ? iso : isoValues[0]}
                  onChange={setIso}
                  format={(v) => `ISO ${v}`}
                />
              )}
              <p className="inline-flex items-center gap-1.5 px-1 text-xs text-ink-3">
                <Aperture size={13} /> 絞りはこの端末・ブラウザでは変更できません
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-2">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="neu neu-sm neu-convex neu-press flex h-12 w-12 items-center justify-center rounded-full text-ink-2"
            aria-label="ライブラリから選ぶ"
          >
            <ImageUp size={20} />
          </button>
          <span className="text-[10px] text-ink-3">ライブラリ</span>
        </div>
        <button
          type="button"
          onClick={shoot}
          disabled={!cameraOn || !!busy}
          aria-label="撮影する"
          data-testid="shutter"
          className="neu neu-lg neu-convex neu-press flex h-20 w-20 items-center justify-center rounded-full disabled:opacity-50"
        >
          <span className="neu-accent block h-14 w-14 rounded-full" />
        </button>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => rawRef.current?.click()}
            className="neu neu-sm neu-convex neu-press flex h-12 w-12 items-center justify-center rounded-full text-[11px] font-bold text-ink-2"
            aria-label="RAWファイルを取り込む"
          >
            RAW
          </button>
          <span className="text-[10px] text-ink-3">取り込み</span>
        </div>
      </div>

      <Button variant="glass" icon={<FileImage size={16} />} onClick={() => nativeRef.current?.click()}>
        標準カメラで撮る
      </Button>

      <CapabilityPanel caps={caps} cameraOn={cameraOn} />

      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="library-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0], "library");
          e.target.value = "";
        }}
      />
      <input
        ref={rawRef}
        type="file"
        accept={[...RAW_EXTENSIONS, "image/x-adobe-dng"].join(",")}
        className="hidden"
        data-testid="raw-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0], "raw");
          e.target.value = "";
        }}
      />
      <input
        ref={nativeRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="native-input"
        onChange={(e) => {
          void onFile(e.target.files?.[0], "native");
          e.target.value = "";
        }}
      />
    </div>
  );
}
