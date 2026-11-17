"use client";

import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Header } from "./header";
import { TabBar } from "./tab-bar";

/** ログイン後の画面共通の枠（ヘッダー・本文・タブバー） */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        right={
          <Link
            href="/notifications"
            aria-label="お知らせ"
            className="neu neu-sm neu-convex neu-press flex h-9 w-9 items-center justify-center rounded-full text-ink-2"
          >
            <Bell size={18} />
          </Link>
        }
      />
      <main className="safe-bottom mx-auto w-full max-w-2xl px-4 pt-5">{children}</main>
      <TabBar />
    </>
  );
}
