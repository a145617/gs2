"use client";

import { useSyncExternalStore } from "react";

// デバッグモードの表示切り替え（この端末だけの設定）

const KEYS = { feedDebug: "hk:debugFeedScores" } as const;

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setDebugFlag(name: keyof typeof KEYS, on: boolean) {
  try {
    if (on) localStorage.setItem(KEYS[name], "1");
    else localStorage.removeItem(KEYS[name]);
  } catch {
    // 保存できなくても無視
  }
  for (const l of listeners) l();
}

/** フィードの並び順の内訳（人気・好み・ランダム）を表示するか */
export function useFeedDebug(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(KEYS.feedDebug),
    () => false,
  );
}
