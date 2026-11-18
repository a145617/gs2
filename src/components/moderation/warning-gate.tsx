"use client";

import { useState } from "react";
import useSWR from "swr";
import { TriangleExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { formatJstDateTime } from "@/lib/time";

type Warning = { id: string; message: string; createdAt: string };

/**
 * 管理者からの警告。本人が「確認しました」を押すまで、閉じられないシートで表示し続ける。
 */
export function WarningGate() {
  const { data, mutate } = useSWR<{ items: Warning[] }>("/api/me/warnings", { refreshInterval: 5 * 60 * 1000 });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const items = data?.items ?? [];
  const w = items[items.length - 1]; // 古い警告から順に確認してもらう

  async function acknowledge() {
    if (!w) return;
    setBusy(true);
    try {
      await api(`/api/me/warnings/${w.id}`, { method: "POST" });
      await mutate({ items: items.filter((x) => x.id !== w.id) }, { revalidate: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!w} onClose={() => {}} dismissible={false} title="管理者からの警告">
      {w && (
        <div className="flex flex-col gap-4" data-testid="warning-gate">
          <div className="flex items-start gap-3 rounded-[18px] bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] p-4">
            <TriangleExclamationPoint size={22} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink" data-testid="warning-message">
              {w.message}
            </p>
          </div>
          <p className="text-xs text-ink-3">{formatJstDateTime(w.createdAt, true)}</p>
          <p className="text-sm leading-relaxed text-ink-2">
            ひとこまを安心して楽しめる場所にするため、ガイドラインを守ってご利用ください。
            違反が続く場合は、アカウントを削除することがあります。
          </p>
          {items.length > 1 && <p className="text-xs text-ink-3">ほかに {items.length - 1} 件の警告があります。</p>}
          <Button variant="accent" loading={busy} onClick={acknowledge} data-testid="warning-ack">
            確認しました
          </Button>
        </div>
      )}
    </Sheet>
  );
}
