"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="neu neu-sm neu-convex relative inline-flex items-center justify-center rounded-full"
        style={{ width: size + 8, height: size + 8 }}
      >
        <span
          className="rounded-full"
          style={{
            width: size * 0.55,
            height: size * 0.55,
            background: "radial-gradient(circle at 35% 35%, color-mix(in oklab, var(--accent) 50%, white), var(--accent))",
            boxShadow: "inset 0 0 0 2px color-mix(in oklab, var(--accent) 40%, transparent)",
          }}
        />
      </span>
      <span className="font-display text-[19px] font-bold tracking-[0.18em] text-ink">ひとこま</span>
    </span>
  );
}

/** 画面上部のすりガラスのヘッダー */
export function Header({ right, left }: { right?: ReactNode; left?: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-40 px-3"
      style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}
    >
      <div className="glass glass-sheen mx-auto flex h-[52px] max-w-2xl items-center justify-between rounded-[20px] pr-2 pl-3">
        {left ?? (
          <Link href="/" aria-label="ひとこま ホーム">
            <Logo />
          </Link>
        )}
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
