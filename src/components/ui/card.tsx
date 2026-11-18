import clsx from "clsx";
import type { ComponentProps } from "react";

/** ニューモーフィズムの浮き出たカード */
export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("neu p-5", className)} {...rest} />;
}

/** くぼんだパネル */
export function InsetPanel({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("neu-inset p-4", className)} {...rest} />;
}

/** すりガラスのパネル */
export function GlassPanel({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("glass glass-sheen rounded-[var(--radius)] p-5", className)} {...rest} />;
}

export function SectionTitle({ className, ...rest }: ComponentProps<"h2">) {
  return <h2 className={clsx("mb-3 px-1 text-[13px] font-bold tracking-wider text-ink-3", className)} {...rest} />;
}
