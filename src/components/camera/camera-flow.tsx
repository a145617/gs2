"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { CaptureStep, type Captured, type StreamFactory } from "./capture-step";
import { DevelopStep, type Developed } from "./develop-step";
import { DetailsStep, type PostFields } from "./details-step";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/client/api";
import { compactMeta } from "@/lib/client/exif";
import type { CameraCapabilities } from "@/lib/client/camera";
import type { PhotoMeta } from "@/lib/photo-meta";

type Step = "capture" | "develop" | "details";

export type SubmitPayload = { fields: PostFields; developed: Developed; meta: PhotoMeta };

/**
 * 撮影 → 現像 → 投稿内容の入力 の流れ。
 * 投稿先（今日のお題 / イベント）は onSubmit で切り替える。
 */
export function CameraFlow({
  header,
  context,
  overlay,
  onSubmit,
  streamFactory,
  capabilityOverride,
  defaultTitle,
}: {
  header?: ReactNode;
  context?: ReactNode;
  overlay?: (video: HTMLVideoElement | null) => ReactNode;
  onSubmit: (p: SubmitPayload) => Promise<void>;
  streamFactory?: StreamFactory;
  capabilityOverride?: (caps: CameraCapabilities) => CameraCapabilities;
  defaultTitle?: string;
}) {
  const [step, setStep] = useState<Step>("capture");
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [developed, setDeveloped] = useState<Developed | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  const onCaptured = useCallback((c: Captured) => {
    setCaptured(c);
    setStep("develop");
  }, []);

  const meta = captured ? compactMeta({ ...captured.meta, mode: captured.mode }) : null;

  async function submit(fields: PostFields) {
    if (!developed || !meta) return;
    setSubmitting(true);
    setErrors({});
    try {
      await onSubmit({ fields, developed, meta });
    } catch (err) {
      const fieldErrors = err instanceof ApiError ? (err.details as { fields?: Record<string, string> } | undefined)?.fields : undefined;
      if (fieldErrors) setErrors(fieldErrors);
      toast.error(err instanceof Error ? err.message : "投稿できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      {step === "capture" && (
        <CaptureStep
          header={header}
          overlay={overlay}
          onCaptured={onCaptured}
          streamFactory={streamFactory}
          capabilityOverride={capabilityOverride}
        />
      )}
      {step === "develop" && captured && (
        <DevelopStep
          captured={captured}
          onBack={() => setStep("capture")}
          onDone={(d) => {
            setDeveloped(d);
            setStep("details");
          }}
        />
      )}
      {step === "details" && developed && meta && (
        <DetailsStep
          developed={developed}
          meta={meta}
          context={context}
          onBack={() => setStep("develop")}
          onSubmit={submit}
          errors={errors}
          submitting={submitting}
          defaultTitle={defaultTitle}
        />
      )}
    </div>
  );
}
