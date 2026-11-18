"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, Info, X } from "lucide-react";
import { useMounted } from "@/lib/client/use-mounted";

type Kind = "info" | "success" | "error";
type ToastItem = { id: number; kind: Kind; message: string };

type ToastApi = {
  show: (message: string, kind?: Kind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const mounted = useMounted();

  const remove = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message: string, kind: Kind = "info") => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, kind, message }]);
      window.setTimeout(() => remove(id), kind === "error" ? 5200 : 3200);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, "success"), error: (m) => show(m, "error") }),
    [show],
  );

  return (
    <ToastContext value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4"
            style={{ top: "calc(var(--safe-top) + 12px)" }}
            aria-live="polite"
          >
            {items.map((t) => (
              <div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                className="glass-strong animate-fade-up pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm text-ink"
              >
                <span
                  className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white",
                    t.kind === "success" && "bg-ok",
                    t.kind === "error" && "bg-danger",
                    t.kind === "info" && "bg-accent",
                  )}
                >
                  {t.kind === "success" ? <Check size={14} /> : t.kind === "error" ? <X size={14} /> : <Info size={14} />}
                </span>
                <span className="leading-snug">{t.message}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast は ToastProvider の中で使ってください");
  return ctx;
}
