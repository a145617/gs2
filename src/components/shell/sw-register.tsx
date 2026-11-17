"use client";

import { useEffect } from "react";

/** 本番環境でのみ Service Worker（オフライン表示・静的ファイルのキャッシュ）を登録する */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // 登録に失敗してもアプリは動くので無視する
    });
  }, []);
  return null;
}
