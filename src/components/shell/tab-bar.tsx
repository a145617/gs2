"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Camera, Compass, House, Palette, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const ITEMS: Item[] = [
  { href: "/", label: "ホーム", icon: House, match: (p) => p === "/" },
  { href: "/explore", label: "さがす", icon: Compass, match: (p) => p.startsWith("/explore") || p.startsWith("/tags") || p.startsWith("/themes") },
  { href: "/camera", label: "撮る", icon: Camera, match: (p) => p.startsWith("/camera") },
  { href: "/event", label: "イベント", icon: Palette, match: (p) => p.startsWith("/event") },
  { href: "/me", label: "マイページ", icon: UserRound, match: (p) => p === "/me" || p.startsWith("/settings") || p.startsWith("/bookmarks") },
];

/** 画面下のすりガラスのタブバー。中央の「撮る」だけ浮き出たボタンにする */
export function TabBar({ meHref = "/me", eventActive = false }: { meHref?: string; eventActive?: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 10px)" }}
    >
      <ul className="glass glass-sheen flex h-[64px] w-full max-w-md items-center justify-between rounded-[26px] px-2">
        {ITEMS.map((item) => {
          const href = item.href === "/me" ? meHref : item.href;
          const active = item.match(pathname) || (item.href === "/me" && pathname === meHref);
          const Icon = item.icon;
          if (item.href === "/camera") {
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className="neu-accent neu-press -mt-9 flex h-[62px] w-[62px] items-center justify-center rounded-full ring-4 ring-[var(--bg)]"
                >
                  <Icon size={26} strokeWidth={2.2} />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href} className="flex flex-1 justify-center">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-accent" : "text-ink-3",
                )}
              >
                <span
                  className={clsx(
                    "flex h-8 w-11 items-center justify-center rounded-xl transition-[box-shadow]",
                    active && "neu-inset neu-sm",
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
                </span>
                {item.label}
                {item.href === "/event" && eventActive && (
                  <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-accent" aria-label="開催中" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
