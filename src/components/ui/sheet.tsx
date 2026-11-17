"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * 画面下からせり上がるすりガラスのシート（モーダル）。
 * Escキー・背景タップで閉じる。開いている間は背面のスクロールを止める。
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([data-sheet-close]), [href], [tabindex]:not([tabindex='-1'])",
    );
    (first ?? panel)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, dismissible, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: "var(--scrim)", animation: "scrim-in .2s ease both" }}
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          "glass-strong relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pt-3 outline-none sm:rounded-[28px]",
          className,
        )}
        style={{
          animation: "sheet-in .28s cubic-bezier(.2,.8,.2,1) both",
          paddingBottom: "calc(20px + var(--safe-bottom))",
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--line)] sm:hidden" aria-hidden="true" />
        {(title || dismissible) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            {title ? (
              <h2 id={titleId} className="text-lg font-bold text-ink">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {dismissible && (
              <button
                type="button"
                data-sheet-close
                onClick={onClose}
                aria-label="閉じる"
                className="neu neu-sm neu-convex neu-press flex h-9 w-9 items-center justify-center rounded-full text-ink-2"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
