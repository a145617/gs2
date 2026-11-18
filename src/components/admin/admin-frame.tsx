"use client";

import { Suspense } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import {
  CalendarClock,
  Flag,
  Gauge,
  LayoutGrid,
  MessagesSquare,
  Palette,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty";
import { PageSpinner } from "@/components/ui/spinner";
import { useMe } from "@/lib/client/session";
import type { AdminStats } from "./types";

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/admin", label: "概要", icon: Gauge },
  { href: "/admin/reports", label: "通報", icon: Flag },
  { href: "/admin/posts", label: "投稿", icon: LayoutGrid },
  { href: "/admin/comments", label: "コメント", icon: MessagesSquare },
  { href: "/admin/users", label: "アカウント", icon: Users },
  { href: "/admin/themes", label: "お題", icon: CalendarClock },
  { href: "/admin/events", label: "イベント", icon: Palette },
  { href: "/admin/settings", label: "設定", icon: SlidersHorizontal },
  { href: "/admin/audit", label: "記録", icon: ScrollText },
];

function AdminNav() {
  const pathname = usePathname() ?? "";
  return <AdminNavView pathname={pathname} />;
}

function AdminNavView({ pathname }: { pathname: string }) {
  const { data: stats } = useSWR<AdminStats>("/api/admin/stats", { refreshInterval: 60_000 });
  return (
    <nav aria-label="管理メニュー" className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      <ul className="flex w-max gap-2">
        {ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const badge = item.href === "/admin/reports" ? (stats?.openReports ?? 0) : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap",
                  active ? "neu-inset neu-sm text-accent" : "neu neu-sm neu-convex neu-press text-ink-2",
                )}
              >
                <Icon size={16} />
                {item.label}
                {badge > 0 && (
                  <span
                    className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
                    aria-label={`未対応${badge}件`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * 管理画面の共通の枠（上部のメニュー）。
 * 各ページは常に描画する（Next.js の事前描画で中身を確認できるように）。管理者かどうかの確認は AdminOnly で行う。
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const { me } = useMe();
  return (
    <div className="flex flex-col gap-4" data-testid="admin">
      {me?.role === "admin" && (
        // 現在のURLを読む部品は Suspense で囲む（Next.js の静的シェルを壊さないため）
        <Suspense fallback={<AdminNavView pathname="" />}>
          <AdminNav />
        </Suspense>
      )}
      {children}
    </div>
  );
}

/** 管理者だけに中身を表示する（管理者以外には案内を出し、管理用のAPIも呼ばない） */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { me } = useMe();
  if (!me) return <PageSpinner />;
  if (me.role !== "admin") {
    return (
      <EmptyState icon={<ShieldCheck size={24} />} title="管理者のみ利用できます">
        <Link href="/" className="text-sm text-accent">
          ホームへ戻る
        </Link>
      </EmptyState>
    );
  }
  return <>{children}</>;
}
