"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { detectBrowserCapabilities, describeDevice, probeCamera } from "@/lib/client/capabilities";
import { setDebugCameraMode, useDebugCameraMode, type DebugCameraMode } from "@/lib/client/debug-camera";
import { setDebugFlag, useFeedDebug } from "@/lib/client/debug-flags";
import { useMounted } from "@/lib/client/use-mounted";
import { EXPOSURE_UNIT_PER_SECOND, type CameraCapabilities } from "@/lib/client/camera";
import { formatShutter } from "@/lib/photo-meta";
import { InfoRow, Panel } from "./shared";

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={clsx("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold", ok ? "bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok" : "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger")}>
      {ok ? "対応" : "非対応"}
    </span>
  );
}

function CameraResult({ caps, label }: { caps: CameraCapabilities; label: string }) {
  const shutter = caps.shutter
    ? `${formatShutter(caps.shutter.min / EXPOSURE_UNIT_PER_SECOND)} 〜 ${formatShutter(caps.shutter.max / EXPOSURE_UNIT_PER_SECOND)}`
    : null;
  const iso = caps.iso ? `${caps.iso.min} 〜 ${caps.iso.max}` : null;
  const any = !!shutter || !!iso;
  return (
    <div className="neu-inset neu-sm rounded-[16px] px-4 py-2" data-testid="debug-camera-result">
      {label && <p className="pb-1 text-xs text-ink-3">{label}</p>}
      <InfoRow label="シャッタースピード">{shutter ?? <Mark ok={false} />}</InfoRow>
      <InfoRow label="ISO感度">{iso ?? <Mark ok={false} />}</InfoRow>
      <InfoRow label="絞り（F値）">
        <Mark ok={false} />
      </InfoRow>
      <InfoRow label="高画質の撮影">
        <Mark ok={caps.takePhoto} />
      </InfoRow>
      <p className="pt-2 text-xs leading-relaxed text-ink-3">
        {any
          ? "撮影画面では、対応している項目だけを手動で設定できます。"
          : "この端末・ブラウザでは手動設定ができないため、撮影画面では通常の撮影になります（そのことを撮影画面に表示します）。"}
        絞りはWebから操作する方法がないため、どの端末でも設定できません。RAWはファイルの取り込みで扱います。
      </p>
    </div>
  );
}

/** この端末で使える機能・カメラの対応状況・疑似カメラ */
export function DevicePanel() {
  const mounted = useMounted();
  const cameraMode = useDebugCameraMode();
  const feedDebug = useFeedDebug();
  const [probe, setProbe] = useState<Awaited<ReturnType<typeof probeCamera>> | null>(null);
  const [probing, setProbing] = useState(false);
  const caps = mounted ? detectBrowserCapabilities() : [];

  return (
    <Panel
      id="device"
      icon={<Smartphone size={20} />}
      title="端末・カメラ"
      description="Android・iOS の Chrome・Firefox・Safari で動作を確認するための情報です。カメラのない環境では疑似カメラで撮影の流れを確認できます。"
    >
      <div>
        <InfoRow label="端末・ブラウザ" testId="debug-device">
          {mounted ? describeDevice() : "…"}
        </InfoRow>
      </div>
      <ul className="flex flex-col" data-testid="debug-capabilities">
        {caps.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-b-0">
            <span className="min-w-0">
              <span className="block text-sm text-ink">{c.label}</span>
              <span className="block text-[11px] text-ink-3">{c.usedFor}</span>
            </span>
            <Mark ok={c.ok} />
          </li>
        ))}
      </ul>

      <Button
        loading={probing}
        onClick={async () => {
          setProbing(true);
          setProbe(await probeCamera());
          setProbing(false);
        }}
        data-testid="debug-camera-probe"
      >
        カメラの手動設定への対応を調べる
      </Button>
      {probe && (probe.ok ? <CameraResult caps={probe.caps} label={probe.label} /> : <p className="text-sm text-danger">{probe.error}</p>)}

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[13px] font-bold text-ink-2">疑似カメラ（この端末だけの設定）</p>
        <Segmented<DebugCameraMode>
          ariaLabel="疑似カメラ"
          value={mounted ? cameraMode : "off"}
          onChange={setDebugCameraMode}
          options={[
            { value: "off", label: "オフ" },
            { value: "fake", label: "疑似カメラ" },
            { value: "fake-manual", label: "手動設定あり" },
          ]}
        />
        <p className="px-1 text-xs leading-relaxed text-ink-3">
          撮影画面で、本物のカメラの代わりに動く風景の映像を使います。「手動設定あり」では、シャッタースピード・ISOに対応した端末のふりをします。
        </p>
      </div>

      <a href="/api/debug/sample-dng" download className="neu neu-sm neu-convex neu-press flex h-11 items-center justify-center rounded-[16px] text-sm text-ink" data-testid="debug-sample-dng">
        サンプルのRAW（DNG）をダウンロード
      </a>
      <p className="-mt-2 px-1 text-xs leading-relaxed text-ink-3">
        撮影画面の「ライブラリ」から選ぶと、RAWの読み込みと現像（露出・ホワイトバランスなど）を確認できます。
      </p>

      <Toggle
        checked={mounted && feedDebug}
        onChange={(v) => setDebugFlag("feedDebug", v)}
        label="フィードの並び順の内訳を表示"
        description="ホームの各投稿に、人気・好み・ランダムの点数を表示します"
      />
    </Panel>
  );
}
