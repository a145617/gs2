"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ImageUp, Trash } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import type { Me } from "@/lib/types";

const VIEW = 260; // 切り抜き枠の大きさ（px）
const OUT = 512; // 書き出すアイコン画像の大きさ（px）

/** アイコン画像の変更（選んだ画像を円形に切り抜いてアップロード） */
export function AvatarEditor({ me, onUpdated }: { me: Me; onUpdated: (me: Me) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!src) return;
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => {
      toast.error("この画像は読み込めませんでした（JPEG・PNGなどをお試しください）");
      setSrc(null);
    };
    image.src = src;
    return () => URL.revokeObjectURL(src);
  }, [src, toast]);

  // 画像を枠いっぱいに収めたときの倍率
  const baseScale = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = baseScale * zoom;

  function clampOffset(x: number, y: number, z = zoom) {
    if (!img) return { x, y };
    const s = baseScale * z;
    const maxX = Math.max(0, (img.naturalWidth * s - VIEW) / 2);
    const maxY = Math.max(0, (img.naturalHeight * s - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    setOffset(clampOffset(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y));
  }

  async function save() {
    if (!img) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      // 表示中の枠に入っている範囲を、元画像の座標に変換して切り抜く
      const sw = VIEW / scale;
      const sx = img.naturalWidth / 2 - offset.x / scale - sw / 2;
      const sy = img.naturalHeight / 2 - offset.y / scale - sw / 2;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("toBlob");
      const form = new FormData();
      form.append("image", blob, "avatar.jpg");
      const res = await api<{ user: Me }>("/api/me/avatar", { method: "POST", body: form });
      onUpdated(res.user);
      toast.success("アイコンを変更しました");
      setSrc(null);
      setImg(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "アイコンを保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      const res = await api<{ user: Me }>("/api/me/avatar", { method: "DELETE" });
      onUpdated(res.user);
      toast.success("アイコンを削除しました");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "削除できませんでした");
    }
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar src={me.avatarUrl} name={me.displayName} size={76} ring />
      <div className="flex flex-col gap-2">
        <Button size="sm" icon={<ImageUp size={15} />} onClick={() => fileRef.current?.click()}>
          アイコンを変更
        </Button>
        {me.avatarUrl && (
          <Button size="sm" variant="ghost" icon={<Trash size={15} />} onClick={remove}>
            削除
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="avatar-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setZoom(1);
          setOffset({ x: 0, y: 0 });
          setImg(null);
          setSrc(URL.createObjectURL(f));
        }}
      />
      <Sheet open={!!src} onClose={() => setSrc(null)} title="アイコンの切り抜き">
        <div className="flex flex-col items-center gap-5">
          <div
            className="neu-inset relative touch-none overflow-hidden rounded-full"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element -- 端末内の画像（blob URL）を表示
              <img
                src={img.src}
                alt="切り抜きのプレビュー"
                draggable={false}
                className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
                style={{
                  width: img.naturalWidth * scale,
                  height: img.naturalHeight * scale,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
          </div>
          <label className="flex w-full items-center gap-3 text-sm text-ink-2">
            拡大
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setOffset((o) => clampOffset(o.x, o.y, z));
              }}
              className="flex-1 accent-[var(--accent)]"
            />
          </label>
          <p className="text-xs text-ink-3">ドラッグで位置を調整できます</p>
          <Button variant="accent" size="lg" className="w-full" loading={saving} disabled={!img} onClick={save}>
            この範囲で保存
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
