"use client";

import useSWR from "swr";
import type { MeResponse } from "@/lib/types";
import type { ApiError } from "./api";

/** ログイン中のユーザー情報（/api/me） */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse, ApiError>("/api/me", {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  return {
    me: data?.user ?? null,
    debugMode: data?.debugMode ?? false,
    serverNow: data?.serverNow ?? null,
    impersonator: data?.impersonator ?? null,
    isLoading,
    error,
    unauthorized: error?.status === 401,
    mutate,
  };
}

/** 安全な遷移先か（外部サイトへのリダイレクトを防ぐ） */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
