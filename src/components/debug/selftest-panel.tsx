"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { Panel, type SelfTestResponse } from "./shared";

/** サーバー側の自己診断（この環境で、DB・画像の保存・写真の処理などが動くか） */
export function SelfTestPanel() {
  const [data, setData] = useState<SelfTestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function runTests() {
    setBusy(true);
    try {
      const r = await api<SelfTestResponse>("/api/debug/selftest");
      setData(r);
      if (r.ok) toast.success(`自己診断: ${r.results.length}項目すべて正常です`);
      else toast.error(`自己診断: ${r.results.filter((x) => !x.ok).length}項目で問題が見つかりました`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "自己診断を実行できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      id="selftest"
      icon={<FlaskConical size={20} />}
      title="自己診断"
      description="サーバー側の各機能（データベース・画像の保存・写真の処理・お題の切り替え計算・投稿前の閲覧制限・色の判定・検索・パスワード）を、この環境で実際に動かして確かめます。デプロイ後の確認にも使えます。"
    >
      <Button variant="accent" loading={busy} onClick={runTests} data-testid="debug-selftest">
        自己診断を実行
      </Button>
      {data && (
        <ul className="flex flex-col gap-2" data-testid="debug-selftest-results">
          {data.results.map((r) => (
            <li key={r.id} className={clsx("rounded-[14px] px-3 py-2", r.ok ? "neu-inset neu-sm" : "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]")}>
              <p className="flex items-start justify-between gap-2 text-sm">
                <span className={clsx("font-bold", r.ok ? "text-ink" : "text-danger")}>
                  <span aria-hidden="true" className={clsx("mr-1.5", r.ok ? "text-ok" : "text-danger")}>
                    {r.ok ? "✓" : "✕"}
                  </span>
                  {r.name}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">{r.ms}ms</span>
              </p>
              <p className="mt-0.5 pl-5 text-xs break-all text-ink-2" data-testid={`selftest-${r.id}`}>
                {r.ok ? "正常" : "問題あり"}: {r.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
