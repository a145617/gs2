"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

type Option<T extends string> = { value: T; label: ReactNode };

/** くぼんだ溝の中で、選択中の項目だけが浮き上がる切り替えスイッチ */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={clsx("neu-inset neu-sm flex gap-1 rounded-[16px] p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "h-9 flex-1 rounded-[12px] px-3 text-sm font-medium transition-[box-shadow,color]",
              active ? "neu neu-sm neu-convex text-accent" : "text-ink-3",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
