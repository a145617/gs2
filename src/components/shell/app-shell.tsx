"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ShieldCheck } from "lucide-react";
import { Header } from "./header";
import { TabBar } from "./tab-bar";
import { useMe } from "@/lib/client/session";

const iconLink =
  "neu neu-sm neu-convex neu-press flex h-9 w-9 items-center justify-center rounded-full text-ink-2";

/** ログイン後の画面共通の枠（ヘッダー・本文・タブバー） */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, unauthorized } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  // セッションが切れていたらログイン画面へ
  useEffect(() => {
    if (unauthorized) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [unauthorized, pathname, router]);

  return (
    <>
      <Header
        right={
          <>
            {me?.role === "admin" && (
              <Link href="/admin" aria-label="管理画面" className={iconLink}>
                <ShieldCheck size={18} />
              </Link>
            )}
            <Link href="/notifications" aria-label="お知らせ" className={iconLink}>
              <Bell size={18} />
            </Link>
          </>
        }
      />
      <main className="safe-bottom mx-auto w-full max-w-2xl px-4 pt-5">{children}</main>
      <TabBar />
    </>
  );
}
