"use client";

import useSWR from "swr";
import { Bug, TriangleExclamationPoint } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { ClockPanel } from "@/components/debug/clock-panel";
import { ThemePanel } from "@/components/debug/theme-panel";
import { EventPanel } from "@/components/debug/event-panel";
import { DataPanel } from "@/components/debug/data-panel";
import { UsersPanel } from "@/components/debug/users-panel";
import { DevicePanel } from "@/components/debug/device-panel";
import { ChecklistPanel } from "@/components/debug/checklist-panel";
import { SelfTestPanel } from "@/components/debug/selftest-panel";
import type { DebugStatus } from "@/components/debug/shared";
import { useMe } from "@/lib/client/session";

const SECTIONS = [
  { id: "clock", label: "時計" },
  { id: "theme", label: "お題" },
  { id: "event", label: "イベント" },
  { id: "data", label: "データ" },
  { id: "users", label: "切り替え" },
  { id: "device", label: "端末" },
  { id: "checklist", label: "確認リスト" },
  { id: "selftest", label: "自己診断" },
];

function DebugContent({ impersonating }: { impersonating: boolean }) {
  const { data } = useSWR<DebugStatus>("/api/debug/status", { refreshInterval: 30_000 });
  return (
    <div className="flex flex-col gap-5 animate-fade-up" data-testid="debug-page">
      <PageHeader title="デバッグ" subtitle="仕様の各機能を確認するための操作" />
      <div className="flex items-start gap-3 rounded-[18px] bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-4 py-3 text-xs leading-relaxed text-ink-2">
        <TriangleExclamationPoint size={18} className="mt-0.5 shrink-0 text-warn" />
        <p>
          デバッグモードが有効です（環境変数 <code>DEBUG_MODE=true</code>）。ここでの操作は、この環境を使うすべての人に反映されます。
          一般に公開する環境では <code>DEBUG_MODE=false</code> にしてください。
        </p>
      </div>
      <nav aria-label="デバッグの項目" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="neu neu-sm neu-convex neu-press flex h-9 items-center rounded-full px-3.5 text-sm text-ink-2">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {data ? (
        <>
          <ClockPanel status={data} />
          <ThemePanel status={data} />
          <EventPanel status={data} />
          <DataPanel status={data} impersonating={impersonating} />
          <UsersPanel status={data} impersonating={impersonating} />
        </>
      ) : (
        <PageSpinner />
      )}
      <DevicePanel />
      <ChecklistPanel />
      <SelfTestPanel />
    </div>
  );
}

/** デバッグモード: 仕様書のすべての機能を確認するための画面 */
export default function DebugPage() {
  const { me, debugMode, impersonator } = useMe();
  if (!me) return <PageSpinner />;
  if (!debugMode) {
    return (
      <EmptyState icon={<Bug size={24} />} title="デバッグモードは無効です">
        環境変数 DEBUG_MODE を true にすると使えます。
      </EmptyState>
    );
  }
  return <DebugContent impersonating={!!impersonator} />;
}
