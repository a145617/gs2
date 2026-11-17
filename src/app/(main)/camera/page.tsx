"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { CameraFlow, type SubmitPayload } from "@/components/camera/camera-flow";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { useCurrentTheme } from "@/lib/client/theme";
import { useDebugCamera } from "@/lib/client/debug-camera";
import type { PostDTO, ThemeDTO } from "@/lib/types";

function ThemeChip({ theme }: { theme: ThemeDTO }) {
  return (
    <div className="glass flex items-center justify-between gap-3 rounded-[20px] px-4 py-3" data-testid="camera-theme">
      <span className="text-xs font-bold text-ink-3">今日のお題</span>
      <span className="font-display truncate text-xl font-bold" style={{ color: `color-mix(in oklab, ${theme.accent} 78%, var(--text))` }}>
        {theme.title}
      </span>
      <span className="text-xs text-ink-3">表示: {theme.templateName}</span>
    </div>
  );
}

/** 撮影・投稿（今日のお題） */
export default function CameraPage() {
  const { data, error } = useCurrentTheme();
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const debugCamera = useDebugCamera();

  if (error) return <EmptyState title="お題を読み込めませんでした" />;
  if (!data) return <PageSpinner />;
  const theme = data.theme;
  const limitReached = data.dailyLimit !== null && data.dailyLimit > 0 && data.myPostCount >= data.dailyLimit;
  if (limitReached) {
    return <EmptyState title="今日の投稿数の上限に達しました">次のお題をお楽しみに。</EmptyState>;
  }

  async function submit({ fields, developed, meta }: SubmitPayload) {
    const form = new FormData();
    form.append("image", developed.blob, "photo.jpg");
    form.append("title", fields.title);
    form.append("caption", fields.caption);
    form.append("tags", fields.tags);
    form.append("themeId", theme.id);
    form.append("meta", JSON.stringify(meta));
    const res = await api<{ post: PostDTO }>("/api/posts", { method: "POST", body: form });
    await mutate((key) => typeof key === "string" && (key.startsWith("/api/themes") || key.startsWith("/api/feed")));
    toast.success(`投稿しました。みんなの「${theme.title}」が見られるようになりました`);
    router.replace(`/p/${res.post.id}`);
  }

  return (
    <CameraFlow
      header={<ThemeChip theme={theme} />}
      context={<ThemeChip theme={theme} />}
      onSubmit={submit}
      streamFactory={debugCamera.streamFactory}
      capabilityOverride={debugCamera.capabilityOverride}
    />
  );
}
