"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Ellipsis, Flag, VolumeX, Volume2 } from "lucide-react";
import { useSWRConfig } from "swr";
import { IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { ReportSheet } from "./report-sheet";

type Props = {
  targetType: "post" | "comment" | "user";
  targetId: string;
  /** ミュートの対象（投稿者・コメント主・ユーザー） */
  user?: { handle: string; displayName: string; muted?: boolean };
  /** そのほかの項目（自分の投稿の削除など） */
  extra?: ReactNode;
  onReported?: (autoHidden: boolean) => void;
  onMuteChange?: (muted: boolean) => void;
  label?: string;
};

const item = "neu neu-sm neu-convex neu-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm";

/** 「…」メニュー（通報・ミュートなど） */
export function ContentMenu({ targetType, targetId, user, extra, onReported, onMuteChange, label = "メニュー" }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const toast = useToast();
  const { mutate } = useSWRConfig();

  async function toggleMute() {
    if (!user) return;
    const next = !user.muted;
    try {
      await api(`/api/users/${encodeURIComponent(user.handle)}/mute`, { method: next ? "POST" : "DELETE" });
      toast.show(next ? `${user.displayName}さんをミュートしました` : `${user.displayName}さんのミュートを解除しました`);
      setOpen(false);
      onMuteChange?.(next);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作できませんでした");
    }
  }

  return (
    <>
      <IconButton label={label} onClick={() => setOpen(true)} size={36} data-testid="content-menu">
        <Ellipsis size={18} />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="メニュー">
        <div className="flex flex-col gap-3">
          {extra}
          {user && (
            <button type="button" className={`${item} text-ink-2`} onClick={toggleMute}>
              {user.muted ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {user.muted ? `${user.displayName}さんのミュートを解除` : `${user.displayName}さんをミュート`}
            </button>
          )}
          <button
            type="button"
            className={`${item} text-danger`}
            onClick={() => {
              setOpen(false);
              setReport(true);
            }}
          >
            <Flag size={17} />
            通報する
          </button>
        </div>
      </Sheet>
      <ReportSheet
        open={report}
        onClose={() => setReport(false)}
        targetType={targetType}
        targetId={targetId}
        onReported={onReported}
      />
    </>
  );
}
