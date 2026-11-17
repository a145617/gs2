"use client";

import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ShieldCheck } from "lucide-react";
import { Header } from "./header";
import { TabBar, TabBarView } from "./tab-bar";
import { useMe } from "@/lib/client/session";
import { useCurrentTheme } from "@/lib/client/theme";
import { applyAccent } from "@/lib/client/prefs";

/** 今日のお題の色を、UI全体のアクセント色にする（毎日変わる） */
function ThemeAccentSync() {
  const { data } = useCurrentTheme();
  const accent = data?.theme.accent;
  useEffect(() => {
    if (accent) applyAccent(accent);
  }, [accent]);
  return null;
}

/** セッションが切れていたらログイン画面へ */
function AuthRedirect({ unauthorized }: { unauthorized: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (unauthorized) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [unauthorized, pathname, router]);
  return null;
}

const iconLink =
  "neu neu-sm neu-convex neu-press flex h-9 w-9 items-center justify-center rounded-full text-ink-2";

/** ログイン後の画面共通の枠（ヘッダー・本文・タブバー） */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, unauthorized, unread } = useMe();

  return (
    <>
      {me && <ThemeAccentSync />}
      <Suspense fallback={null}>
        <AuthRedirect unauthorized={unauthorized} />
      </Suspense>
      <Header
        right={
          <>
            {me?.role === "admin" && (
              <Link href="/admin" aria-label="管理画面" className={iconLink}>
                <ShieldCheck size={18} />
              </Link>
            )}
            <Link
              href="/notifications"
              aria-label={unread > 0 ? `お知らせ（未読${unread}件）` : "お知らせ"}
              className={`${iconLink} relative`}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white"
                  data-testid="unread-badge"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </>
        }
      />
      <main className="safe-bottom mx-auto w-full max-w-2xl px-4 pt-5">{children}</main>
      {/* 現在のURLを読む部品は Suspense で囲む（Next.js の静的シェルを壊さないため） */}
      <Suspense fallback={<TabBarView pathname="" />}>
        <TabBar />
      </Suspense>
    </>
  );
}
