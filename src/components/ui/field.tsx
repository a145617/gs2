"use client";

import { forwardRef, useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";

const inputBase =
  "neu-inset neu-sm w-full rounded-[14px] bg-transparent px-4 text-[15px] text-ink placeholder:text-ink-3 outline-none focus-visible:outline-2 focus-visible:outline-accent";

type FieldWrapProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id: string;
  children: ReactNode;
  counter?: ReactNode;
};

function FieldWrap({ label, hint, error, id, children, counter }: FieldWrapProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {(label || counter) && (
        <div className="flex items-baseline justify-between px-1">
          {label ? (
            <label htmlFor={id} className="text-[13px] font-bold text-ink-2">
              {label}
            </label>
          ) : (
            <span />
          )}
          {counter && <span className="text-xs text-ink-3">{counter}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = ComponentProps<"input"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, counter, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid} counter={counter}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={clsx(inputBase, "h-12", className)}
        {...rest}
      />
    </FieldWrap>
  );
});

type TextAreaProps = ComponentProps<"textarea"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, counter, className, id, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid} counter={counter}>
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={clsx(inputBase, "resize-none py-3 leading-relaxed", className)}
        {...rest}
      />
    </FieldWrap>
  );
});

type SelectProps = ComponentProps<"select"> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <select ref={ref} id={fid} className={clsx(inputBase, "h-12 appearance-none", className)} {...rest}>
        {children}
      </select>
    </FieldWrap>
  );
});
