"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/client/api";
import type { getDebugStatus } from "@/server/services/debug";
import type { SelfTestResult } from "@/server/services/selftest";

export type DebugStatus = Awaited<ReturnType<typeof getDebugStatus>>;
export type SelfTestResponse = { results: SelfTestResult[]; ok: boolean; ranAt: string };

/**
 * デバッグの操作を実行する。成功したらトーストで知らせ、画面のデータ（お題・イベント・フィードなど）をすべて読み直す。
 * busy には実行中の操作の名前が入る（ボタンの読み込み中表示に使う）。
 */
export function useDebugAction() {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run<T>(id: string, fn: () => Promise<T>, done?: (r: T) => string | void): Promise<T | undefined> {
    setBusy(id);
    try {
      const r = await fn();
      const msg = done?.(r);
      if (msg) toast.success(msg);
      await mutate(() => true);
      return r;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作できませんでした");
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

/**
 * 操作する人が変わったあと（テスト用ユーザーへの切り替え・元に戻る）に、
 * 前の人のデータを画面から消して読み込み直し、指定の画面へ移る。
 */
export function useAfterSwitch() {
  const { mutate } = useSWRConfig();
  const router = useRouter();
  return async (dest: string) => {
    await mutate(() => true, undefined, { revalidate: true });
    router.replace(dest);
  };
}

/** デバッグ画面の1つの区切り（見出し・説明・中身） */
export function Panel({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`} data-testid={`panel-${id}`}>
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <span className="neu-inset neu-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-accent">{icon}</span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-[17px] font-bold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</p>}
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

/** ラベルと値の行 */
export function InfoRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm last:border-b-0">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right text-ink" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}
