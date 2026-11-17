"use client";

import { useCallback, useSyncExternalStore } from "react";

// 端末ごとの表示設定（localStorage に保存）
export type ThemeMode = "system" | "light" | "dark";

const KEYS = {
  theme: "hk:theme",
  light: "hk:light",
  accent: "hk:accent",
} as const;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key && Object.values(KEYS).includes(e.key as (typeof KEYS)[keyof typeof KEYS])) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // プライベートモードなどで保存できない場合は無視
  }
  emit();
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const mode = useSyncExternalStore(
    subscribe,
    () => (read(KEYS.theme) as ThemeMode | null) ?? "system",
    () => "system" as ThemeMode,
  );
  const set = useCallback((m: ThemeMode) => {
    write(KEYS.theme, m === "system" ? null : m);
    applyThemeMode(m);
  }, []);
  return [mode, set];
}

/** 端末の傾き・指の位置で光源（影の向き）を動かすかどうか */
export function useDynamicLight(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => read(KEYS.light) !== "off",
    () => true,
  );
  const set = useCallback((v: boolean) => write(KEYS.light, v ? "on" : "off"), []);
  return [on, set];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** その日のお題の色をUI全体のアクセント色にする */
export function applyAccent(hex: string | null | undefined) {
  if (!hex || !HEX.test(hex)) return;
  document.documentElement.style.setProperty("--accent", hex);
  if (read(KEYS.accent) !== hex) write(KEYS.accent, hex);
}
