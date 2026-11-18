"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { useAfterSwitch } from "./shared";

/** テスト用ユーザーとして操作している間、画面上部に出す帯（元のアカウントへ戻るボタン付き） */
export function ImpersonationBanner({ me, original }: { me: { displayName: string; handle: string }; original: { displayName: string } }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const afterSwitch = useAfterSwitch();

  async function back() {
    setBusy(true);
    try {
      await api("/api/debug/switch", { method: "DELETE" });
      toast.success("元のアカウントに戻りました");
      await afterSwitch("/debug");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "戻れませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-2xl px-3" role="status" data-testid="impersonation-banner">
      <div className="glass flex items-center gap-3 rounded-[16px] px-3 py-2 text-xs text-ink">
        <ArrowLeftRight size={16} className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 leading-snug">
          テスト用ユーザー <strong>{me.displayName}</strong>（@{me.handle}）として操作中
          <span className="block text-ink-3">元のアカウント: {original.displayName}</span>
        </p>
        <Button size="sm" loading={busy} onClick={back} data-testid="switch-back">
          元に戻る
        </Button>
      </div>
    </div>
  );
}
