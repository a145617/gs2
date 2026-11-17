"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import clsx from "clsx";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { REPORT_REASONS, REPORT_REASON_LABEL, type ReportReason } from "@/lib/moderation";

const TARGET_LABEL = { post: "投稿", comment: "コメント", user: "ユーザー" } as const;

/** 通報のシート（理由を選んで送る） */
export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "post" | "comment" | "user";
  targetId: string;
  onReported?: (autoHidden: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    try {
      const res = await api<{ autoHidden: boolean }>("/api/reports", {
        method: "POST",
        json: { targetType, targetId, reason, detail },
      });
      toast.success("通報しました。ご協力ありがとうございます");
      onReported?.(res.autoHidden);
      setReason(null);
      setDetail("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "通報できませんでした");
      if (err instanceof ApiError && err.code === "already_reported") onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`この${TARGET_LABEL[targetType]}を通報`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-xs text-ink-2">理由を選んでください。管理者が確認します（相手には伝わりません）。</p>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">通報の理由</legend>
          {REPORT_REASONS.map((r) => (
            <label
              key={r}
              className={clsx(
                "flex min-h-11 cursor-pointer items-center rounded-2xl px-3 py-2 text-[13px] leading-snug",
                reason === r ? "neu-inset neu-sm font-bold text-accent" : "neu neu-sm neu-convex text-ink-2",
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="sr-only"
              />
              {REPORT_REASON_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <TextArea
          label="詳しい内容（任意）"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          maxLength={500}
        />
        <Button type="submit" variant="danger" icon={<Flag size={16} />} loading={sending} disabled={!reason}>
          通報する
        </Button>
      </form>
    </Sheet>
  );
}
