import { z } from "zod";

// 通報（クライアントとサーバーで共用）

export const REPORT_REASONS = [
  "spam",
  "inappropriate",
  "violence",
  "harassment",
  "copyright",
  "privacy",
  "off_topic",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "スパム・宣伝",
  inappropriate: "性的・不快な内容",
  violence: "暴力的・危険な内容",
  harassment: "嫌がらせ・誹謗中傷",
  copyright: "著作権などの権利侵害",
  privacy: "個人情報・プライバシーの侵害",
  off_topic: "お題と無関係・不適切な投稿",
  other: "その他",
};

export const reportSchema = z.object({
  targetType: z.enum(["post", "comment", "user"]),
  targetId: z.uuid("通報する対象が正しくありません"),
  reason: z.enum(REPORT_REASONS, "通報の理由を選んでください"),
  detail: z.string().trim().max(500, "詳しい内容は500文字以内にしてください").default(""),
});

export type ReportInput = z.infer<typeof reportSchema>;
