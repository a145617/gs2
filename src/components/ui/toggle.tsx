"use client";

import clsx from "clsx";

type ToggleProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** ニューモーフィズムのスイッチ */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className={clsx("flex items-center justify-between gap-4 py-2", disabled && "opacity-50")}>
      <span className="flex flex-col">
        <span className="text-[15px] text-ink">{label}</span>
        {description && <span className="text-xs text-ink-3">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="neu-inset neu-sm relative h-8 w-14 shrink-0 rounded-full"
      >
        <span
          className={clsx(
            "absolute top-1 left-1 h-6 w-6 rounded-full transition-transform duration-200",
            checked ? "neu-accent neu-sm translate-x-6" : "neu neu-sm neu-convex",
          )}
        />
      </button>
    </label>
  );
}
