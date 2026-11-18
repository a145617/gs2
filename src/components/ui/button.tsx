"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";
import { Spinner } from "./spinner";

type Variant = "neu" | "accent" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 font-medium transition-[box-shadow,transform,opacity] disabled:pointer-events-none disabled:opacity-50";

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-[12px] neu-sm",
  md: "h-11 px-5 text-[15px] rounded-[16px]",
  lg: "h-14 px-7 text-base rounded-[20px]",
};

const variants: Record<Variant, string> = {
  neu: "neu neu-convex neu-press text-ink",
  accent: "neu-accent neu-press",
  ghost: "text-ink-2 hover:text-ink active:opacity-70",
  danger: "neu neu-convex neu-press text-danger",
  glass: "glass glass-sheen text-ink active:scale-[0.98]",
};

export function buttonClass(variant: Variant = "neu", size: Size = "md", extra?: string) {
  return clsx(base, sizes[size], variants[variant], extra);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "neu", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
});

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function LinkButton({ variant = "neu", size = "md", icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

type IconButtonProps = ComponentProps<"button"> & {
  label: string;
  variant?: "neu" | "glass" | "ghost" | "accent";
  size?: number;
  active?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "neu", size = 40, active, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-[box-shadow,transform,color]",
        variant === "neu" && "neu neu-sm neu-convex neu-press text-ink-2",
        variant === "glass" && "glass text-ink active:scale-95",
        variant === "ghost" && "text-ink-2 active:opacity-60",
        variant === "accent" && "neu-accent neu-sm neu-press",
        active && variant === "neu" && "text-accent",
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
});
