"use client";

import { useState } from "react";
import Link from "next/link";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { PRESETS, PRESET_KEYS } from "@/lib/pixel-art";
import { formatJstDateTime } from "@/lib/time";
import type { EventDTO } from "@/lib/types";
import { ArtPreview } from "@/components/admin/art-preview";
import { InfoRow, Panel, useDebugAction, type DebugStatus } from "./shared";

const STATUS = { upcoming: "予定", active: "開催中", completed: "完成", ended: "終了" } as const;
type FillResult = { filled: number; remaining: number; completed: boolean };

/** イベント（色を集めてピクセルアートを完成させる）を、任意のタイミング・内容で開催する */
export function EventPanel({ status }: { status: DebugStatus }) {
  const { busy, run } = useDebugAction();
  const [preset, setPreset] = useState(PRESET_KEYS[0]);
  const [size, setSize] = useState(8);
  const ev = status.event;
  const auto = status.eventAuto;
  const fillMessage = (r: FillResult) =>
    r.completed ? "すべてのマスが埋まり、絵が完成しました！" : `${r.filled}マス埋めました（残り${r.remaining}マス）`;

  return (
    <Panel
      id="event"
      icon={<Palette size={20} />}
      title="イベント"
      description="ふだんは1週間に1度ほど不定期に始まるイベントを、今すぐ開催できます。テスト用ユーザーの写真でマスを埋めて、絵が完成するまでを確認できます。"
    >
      {ev ? (
        <div>
          <InfoRow label="開催中のイベント" testId="debug-event-title">
            {ev.title}
          </InfoRow>
          <InfoRow label="状態" testId="debug-event-status">
            {STATUS[ev.status]}（{ev.filledCells}/{ev.totalCells}マス）
          </InfoRow>
          <InfoRow label="期間">
            {formatJstDateTime(ev.startsAt)} 〜 {formatJstDateTime(ev.endsAt)}
          </InfoRow>
        </div>
      ) : (
        <p className="text-sm text-ink-2" data-testid="debug-event-none">
          開催中のイベントはありません。
        </p>
      )}

      <div className="flex items-center gap-3">
        <ArtPreview art={PRESETS[preset].build(size, size)} size={84} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Select label="絵" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="絵の種類">
            {PRESET_KEYS.map((k) => (
              <option key={k} value={k}>
                {PRESETS[k].name}
              </option>
            ))}
          </Select>
          <Select label="マス目" value={String(size)} onChange={(e) => setSize(Number(e.target.value))} aria-label="マス目の大きさ">
            {[4, 8, 12, 16, 24].map((n) => (
              <option key={n} value={n}>
                {n}×{n}（{n * n}マス）
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button
        variant="accent"
        loading={busy === "start"}
        onClick={() =>
          run(
            "start",
            () => api<{ event: EventDTO }>("/api/debug/events", { method: "POST", json: { preset, size, hours: 72 } }),
            (r) => `イベント「${r.event.title}」を開始しました（開催中のイベントは終了しました）`,
          )
        }
        data-testid="debug-event-start"
      >
        この絵でイベントを今すぐ開始
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          disabled={!ev || ev.status !== "active"}
          loading={busy === "fill5"}
          onClick={() => run("fill5", () => api<FillResult>("/api/debug/events/fill", { method: "POST", json: { count: 5 } }), fillMessage)}
          data-testid="debug-event-fill"
        >
          マスを5つ埋める
        </Button>
        <Button
          size="sm"
          disabled={!ev || ev.status !== "active"}
          loading={busy === "fillAll"}
          onClick={() => run("fillAll", () => api<FillResult>("/api/debug/events/fill", { method: "POST", json: { count: "all" } }), fillMessage)}
          data-testid="debug-event-complete"
        >
          全部埋めて完成
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!ev}
          loading={busy === "end"}
          onClick={() => run("end", () => api("/api/debug/events", { method: "DELETE" }), () => "イベントを終了しました")}
          data-testid="debug-event-end"
        >
          今すぐ終了
        </Button>
        <Button
          size="sm"
          disabled={!!ev}
          loading={busy === "auto"}
          onClick={() =>
            run(
              "auto",
              () => api<{ event: EventDTO }>("/api/debug/events/auto", { method: "POST" }),
              (r) => `自動開催のイベント「${r.event.title}」が始まりました`,
            )
          }
          data-testid="debug-event-auto"
        >
          自動開催を発生
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        次の自動開催: {auto.enabled ? (auto.nextAutoAt ? formatJstDateTime(auto.nextAutoAt, true) : "未定") : "オフ"} ・
        疑似カメラを使うと、撮影画面に担当の色が大きく映ります。
        <Link href="/event" className="ml-1 text-accent">
          イベントを見る
        </Link>
      </p>
    </Panel>
  );
}
