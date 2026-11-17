"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** クライアントで描画されているかどうか（サーバー描画との不一致を避ける） */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
