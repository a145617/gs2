"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type { CurrentThemeResponse } from "@/lib/types";
import type { ApiError } from "./api";

/** サーバー時刻（デバッグの仮想時計を含む）と端末時刻のずれ */
export function useServerSkew(serverNow: string | null | undefined): number {
  const [skew, setSkew] = useState(0);
  useEffect(() => {
    if (!serverNow) return;
    const t = new Date(serverNow).getTime() - Date.now();
    const id = window.setTimeout(() => setSkew(t), 0);
    return () => window.clearTimeout(id);
  }, [serverNow]);
  return skew;
}

/** 今のお題。お題が切り替わる時刻になったら自動で読み直す */
export function useCurrentTheme() {
  const swr = useSWR<CurrentThemeResponse, ApiError>("/api/themes/current", {
    refreshInterval: 5 * 60 * 1000,
  });
  const { data, mutate } = swr;
  const skew = useServerSkew(data?.serverNow);

  useEffect(() => {
    if (!data) return;
    const wait = new Date(data.nextChangeAt).getTime() - (Date.now() + skew) + 1500;
    const id = window.setTimeout(() => mutate(), Math.max(1000, Math.min(wait, 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [data, skew, mutate]);

  return { ...swr, skew };
}
