"use client";

import { useEffect } from "react";
import { useDynamicLight } from "@/lib/client/prefs";

const REST = { x: -0.7, y: -0.7 };
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** iOS では傾きセンサーの利用に許可が必要。ユーザー操作の中から呼ぶ */
export async function requestMotionPermission(): Promise<boolean> {
  const C = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as OrientationCtor | undefined;
  if (!C) return false;
  if (typeof C.requestPermission !== "function") return true;
  try {
    return (await C.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * 光源の向き（--lx, --ly）を、端末の傾き・指やマウスの位置に合わせて動かす。
 * ニューモーフィズムの影とガラスの反射がこれに追従して動的に変化する。
 */
export function LightSource() {
  const [enabled] = useDynamicLight();

  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduce) {
      root.style.setProperty("--lx", String(REST.x));
      root.style.setProperty("--ly", String(REST.y));
      return;
    }

    let target = { ...REST };
    const current = { ...REST };
    let raf = 0;
    let lastOrientation = 0;

    const tick = () => {
      raf = 0;
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      root.style.setProperty("--lx", current.x.toFixed(3));
      root.style.setProperty("--ly", current.y.toFixed(3));
      if (Math.abs(target.x - current.x) > 0.004 || Math.abs(target.y - current.y) > 0.004) {
        raf = requestAnimationFrame(tick);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      lastOrientation = performance.now();
      target = { x: clamp(REST.x + e.gamma / 30), y: clamp(REST.y + (e.beta - 50) / 35) };
      schedule();
    };

    const onPointer = (e: PointerEvent) => {
      // 傾きセンサーが動いている間はそちらを優先
      if (performance.now() - lastOrientation < 1500) return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      target = { x: clamp((e.clientX / w) * 2 - 1), y: clamp((e.clientY / h) * 2 - 1) };
      schedule();
    };

    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return null;
}
