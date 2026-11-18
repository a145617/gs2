"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/client/api";

/** 状態を表す小さな札 */
export function StatusChip({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "danger" | "ok" | "accent"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
        tone === "neutral" && "neu-inset neu-sm text-ink-3",
        tone === "warn" && "bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn",
        tone === "danger" && "bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-danger",
        tone === "ok" && "bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok",
        tone === "accent" && "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent",
      )}
    >
      {children}
    </span>
  );
}

/** 管理画面の検索欄（送信したときだけ検索する） */
export function AdminSearch({ placeholder, onSearch, initial = "" }: { placeholder: string; onSearch: (q: string) => void; initial?: string }) {
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
      className="neu-inset neu-sm flex h-12 items-center gap-2 rounded-[16px] px-4"
    >
      <Search size={18} className="shrink-0 text-ink-3" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  );
}

/**
 * 確認と理由の入力（シートの中身として使う）。
 * 送信に成功したら onDone を呼ぶ。失敗したらトーストで知らせる。
 */
export function ConfirmForm({
  description,
  confirmLabel,
  danger,
  reasonLabel,
  reasonPlaceholder,
  reasonRequired,
  onConfirm,
  onDone,
  onCancel,
}: {
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {description && <div className="text-sm leading-relaxed text-ink-2">{description}</div>}
      {reasonLabel && (
        <TextArea
          label={reasonLabel}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={3}
          maxLength={500}
        />
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            戻る
          </Button>
        )}
        <Button
          type="submit"
          variant={danger ? "danger" : "accent"}
          className="flex-1"
          loading={busy}
          disabled={reasonRequired && !reason.trim()}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

/** 一覧の続きを読み込むボタン */
export function MoreButton({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <Button size="sm" loading={loading} onClick={onClick}>
      もっと見る
    </Button>
  );
}

/** シートの中のメニュー項目 */
export function MenuButton({
  icon,
  children,
  onClick,
  danger,
  testId,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={clsx(
        "neu neu-sm neu-convex neu-press flex h-12 w-full items-center gap-3 rounded-[16px] px-4 text-left text-[15px]",
        danger ? "text-danger" : "text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
