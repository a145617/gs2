"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { CameraFlow, type SubmitPayload } from "@/components/camera/camera-flow";
import { ColorMeter } from "@/components/event/color-meter";
import { ColorSwatch } from "@/components/event/event-view";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { setFakeSceneColor, useDebugCamera } from "@/lib/client/debug-camera";
import { colorCoverage } from "@/lib/color";
import type { CurrentEventResponse, EventPostResult } from "@/lib/types";

/** 現像した写真の、指定の色の割合（投稿前の確認） */
async function coverageOf(blob: Blob, hex: string, deltaE: number) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = Math.max(1, Math.round((96 * bmp.height) / bmp.width));
  const ctx = canvas.getContext("2d");
  if (!ctx) return 1;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return colorCoverage(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 4, hex, deltaE);
}

/** イベントの撮影（担当の色が多く写った写真で、ピクセルアートの1マスを埋める） */
export default function EventCameraPage() {
  const { data, error } = useSWR<CurrentEventResponse>("/api/events/current");
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const debugCamera = useDebugCamera();
  const hex = data?.myColor?.hex ?? null;

  // デバッグ用の疑似カメラには、担当の色を大きく映す
  useEffect(() => {
    setFakeSceneColor(hex);
    return () => setFakeSceneColor(null);
  }, [hex]);

  if (error) return <EmptyState title="イベントを読み込めませんでした" />;
  if (!data) return <PageSpinner />;
  const { event, myColor } = data;
  if (!event || event.status !== "active" || !myColor) {
    return (
      <EmptyState title={event?.status === "completed" ? "この絵はもう完成しました" : "開催中のイベントはありません"}>
        <LinkButton href="/event" size="sm" className="mt-3">
          イベントを見る
        </LinkButton>
      </EmptyState>
    );
  }

  const chip = (
    <div className="glass flex items-center gap-3 rounded-[20px] px-4 py-3" data-testid="event-color-chip">
      <ColorSwatch hex={myColor.hex} size={40} />
      <div className="min-w-0">
        <p className="text-xs text-ink-3">イベント「{event.title}」・あなたの色</p>
        <p className="font-display truncate text-lg font-bold" style={{ color: `color-mix(in oklab, ${myColor.hex} 80%, var(--text))` }}>
          {myColor.name}
        </p>
      </div>
      <span className="ml-auto text-right text-[11px] text-ink-3">
        画面の{Math.round(event.threshold * 100)}%
        <br />
        以上をこの色に
      </span>
    </div>
  );

  async function submit({ fields, developed, meta }: SubmitPayload) {
    const ratio = await coverageOf(developed.blob, myColor!.hex, event!.deltaE);
    if (ratio < event!.threshold) {
      throw new Error(
        `「${myColor!.name}」が足りません（写真の${Math.round(ratio * 100)}%。${Math.round(event!.threshold * 100)}%以上必要です）。もっとこの色が大きく写るように撮ってみましょう`,
      );
    }
    const form = new FormData();
    form.append("image", developed.blob, "photo.jpg");
    form.append("title", fields.title);
    form.append("caption", fields.caption);
    form.append("tags", fields.tags);
    form.append("meta", JSON.stringify(meta));
    const res = await api<EventPostResult>(`/api/events/${event!.id}/posts`, { method: "POST", body: form });
    await mutate((key) => typeof key === "string" && key.startsWith("/api/events"));
    toast.success(res.completed ? "あなたの1枚で絵が完成しました！" : "あなたの1ピクセルが絵に加わりました");
    router.replace("/event");
  }

  return (
    <CameraFlow
      header={chip}
      context={chip}
      overlay={(video) => <ColorMeter video={video} hex={myColor.hex} name={myColor.name} threshold={event.threshold} deltaE={event.deltaE} />}
      onSubmit={submit}
      streamFactory={debugCamera.streamFactory}
      capabilityOverride={debugCamera.capabilityOverride}
      defaultTitle={`${myColor.name}のひとこま`}
    />
  );
}
