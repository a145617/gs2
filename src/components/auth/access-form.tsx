"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";
import { safeNext } from "@/lib/client/session";

/** 合言葉の入力（実験的な配布で、合言葉を知っている人だけが使えるようにする） */
export function AccessForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    setLoading(true);
    setError(null);
    try {
      await api("/api/access", { method: "POST", json: { code } });
      router.replace(safeNext(params.get("next"), "/"));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "確認できませんでした。通信状態を確認してください");
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-3">
        <span className="neu-inset neu-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-accent">
          <KeyRound size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-ink">合言葉を入力してください</h1>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
            このサービスは試験公開中です。招待された方にお伝えしている合言葉を入力すると使えるようになります。
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="合言葉"
          name="code"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          error={error ?? undefined}
          required
          data-testid="access-code"
        />
        <Button type="submit" variant="accent" loading={loading} data-testid="access-submit">
          はじめる
        </Button>
      </form>
    </Card>
  );
}
