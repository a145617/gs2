"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/client/api";
import { ToastProvider } from "@/components/ui/toast";
import { LightSource } from "@/components/shell/light-source";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";

/** 画面の準備（ハイドレーション）が終わったら html に印を付ける（自動テストの待ち合わせ用） */
function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        dedupingInterval: 1500,
        shouldRetryOnError: (err: unknown) => {
          const status = (err as { status?: number })?.status ?? 0;
          return status === 0 || status >= 500;
        },
        errorRetryCount: 2,
      }}
    >
      <ToastProvider>
        <HydrationMarker />
        <LightSource />
        <ServiceWorkerRegister />
        {children}
      </ToastProvider>
    </SWRConfig>
  );
}
