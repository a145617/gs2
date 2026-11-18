"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { formatCountdown, formatJstDateTime, fromJstInputValue, toJstInputValue } from "@/lib/time";
import { InfoRow, Panel, useDebugAction, type DebugStatus } from "./shared";

const HOUR = 3600_000;

/** 1秒ごとに進む「アプリの時刻」 */
function useTicking(serverNow: string) {
  const [state, setState] = useState<{ skew: number; t: number } | null>(null);
  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    const tick = () => setState({ skew, t: Date.now() });
    const id = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, [serverNow]);
  return state ? state.t + state.skew : new Date(serverNow).getTime();
}

/** 仮想時計（朝5時のお題の切り替え・イベントの期間を、待たずに確認する） */
export function ClockPanel({ status }: { status: DebugStatus }) {
  const { busy, run } = useDebugAction();
  const appNow = useTicking(status.now);
  const [custom, setCustom] = useState(() => toJstInputValue(status.now));
  const shift = (id: string, body: unknown, message: string) =>
    run(id, () => api("/api/debug/clock", { method: "POST", json: body }), () => message);
  const offsetH = status.offsetMs / HOUR;
  const untilChange = new Date(status.nextChangeAt).getTime() - appNow;

  return (
    <Panel
      id="clock"
      icon={<Clock size={20} />}
      title="時計"
      description="アプリの中の時刻だけを進めます。朝5時のお題の切り替えや、イベントの期間の確認に使います（実際の時刻・ほかの端末の表示にも反映されます）。"
    >
      <div>
        <InfoRow label="アプリの時刻" testId="debug-app-time">
          {formatJstDateTime(new Date(appNow), true)}:{String(new Date(appNow).getUTCSeconds()).padStart(2, "0")}
        </InfoRow>
        <InfoRow label="実際の時刻とのずれ" testId="debug-offset">
          {status.offsetMs === 0 ? "なし" : `${offsetH >= 0 ? "+" : ""}${offsetH.toFixed(offsetH % 1 === 0 ? 0 : 2)}時間`}
        </InfoRow>
        <InfoRow label="次のお題の切り替えまで">{formatCountdown(untilChange)}</InfoRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="accent"
          className="col-span-2"
          loading={busy === "rollover"}
          onClick={() => shift("rollover", { type: "beforeRollover", seconds: 30 }, "朝5時の30秒前に進めました。ホームで切り替わる様子を確認できます")}
          data-testid="clock-rollover"
        >
          次の朝5時の30秒前へ
        </Button>
        <Button size="sm" loading={busy === "h1"} onClick={() => shift("h1", { type: "add", ms: HOUR }, "1時間進めました")}>
          +1時間
        </Button>
        <Button size="sm" loading={busy === "h6"} onClick={() => shift("h6", { type: "add", ms: 6 * HOUR }, "6時間進めました")}>
          +6時間
        </Button>
        <Button size="sm" loading={busy === "d1"} onClick={() => shift("d1", { type: "add", ms: 24 * HOUR }, "1日進めました")} data-testid="clock-day">
          +1日
        </Button>
        <Button size="sm" loading={busy === "w1"} onClick={() => shift("w1", { type: "add", ms: 7 * 24 * HOUR }, "1週間進めました")}>
          +1週間
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="col-span-2"
          loading={busy === "reset"}
          onClick={() => shift("reset", { type: "reset" }, "実際の時刻に戻しました")}
          data-testid="clock-reset"
        >
          実際の時刻に戻す
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField type="datetime-local" label="時刻を指定（日本時間）" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
        <Button
          disabled={!fromJstInputValue(custom)}
          loading={busy === "set"}
          onClick={() => shift("set", { type: "set", at: fromJstInputValue(custom) }, "時刻を変更しました")}
        >
          設定
        </Button>
      </div>
      <p className="text-xs text-ink-3">
        時刻を戻すと、投稿などが「未来」の時刻になることがあります。確認が終わったら「実際の時刻に戻す」を押してください。
        <Link href="/" className="ml-1 text-accent">
          ホームで確認する
        </Link>
      </p>
    </Panel>
  );
}
