"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { safeNext } from "@/lib/client/session";
import { LIMITS } from "@/lib/validation";

// 入力欄は「非制御」にしている（画面の準備が終わる前に入力された文字も消えないように）

type FieldErrors = Record<string, string>;

function fieldErrorsOf(err: unknown): FieldErrors {
  if (err instanceof ApiError) {
    const fields = (err.details as { fields?: FieldErrors } | undefined)?.fields;
    if (fields) return fields;
  }
  return {};
}

function PasswordField({
  error,
  autoComplete,
  label = "パスワード",
}: {
  error?: string;
  autoComplete: string;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextField
        label={label}
        type={show ? "text" : "password"}
        name="password"
        autoComplete={autoComplete}
        error={error}
        hint={autoComplete === "new-password" ? `${LIMITS.passwordMin}文字以上` : undefined}
        className="pr-12"
        required
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
        className="absolute top-[34px] right-3 flex h-8 w-8 items-center justify-center rounded-full text-ink-3"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = params.get("next");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setErrors({});
    setMessage(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        json: { email: str(form, "email"), password: str(form, "password") },
      });
      await mutate("/api/me");
      toast.success("ログインしました");
      router.replace(safeNext(next));
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      setMessage(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <h1 className="text-lg font-bold text-ink">ログイン</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="メールアドレス"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email}
          required
        />
        <PasswordField error={errors.password} autoComplete="current-password" />
        {message && !errors.email && !errors.password && (
          <p role="alert" className="px-1 text-[13px] text-danger">
            {message}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-1 w-full">
          ログイン
        </Button>
      </form>
      <p className="text-center text-sm text-ink-2">
        はじめての方は{" "}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-accent">
          新規登録
        </Link>
      </p>
    </Card>
  );
}

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [nameLength, setNameLength] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setErrors({});
    setMessage(null);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        json: {
          displayName: str(form, "displayName"),
          email: str(form, "email"),
          password: str(form, "password"),
        },
      });
      await mutate("/api/me");
      toast.success("ようこそ、ひとこまへ");
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      const fields = fieldErrorsOf(err);
      if (err instanceof ApiError && err.code === "email_taken") fields.email = err.message;
      setErrors(fields);
      setMessage(err instanceof ApiError ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-lg font-bold text-ink">新規登録</h1>
        <p className="text-xs text-ink-3">ユーザーIDは登録時に自動で割り振られます（あとから変更できません）。</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="ユーザー名"
          name="displayName"
          autoComplete="nickname"
          onChange={(e) => setNameLength(e.target.value.length)}
          error={errors.displayName}
          counter={`${nameLength} / ${LIMITS.displayName}`}
          maxLength={LIMITS.displayName}
          hint="あとから変更できます"
          required
        />
        <TextField
          label="メールアドレス"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email}
          required
        />
        <PasswordField error={errors.password} autoComplete="new-password" />
        {message && Object.keys(errors).length === 0 && (
          <p role="alert" className="px-1 text-[13px] text-danger">
            {message}
          </p>
        )}
        <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-1 w-full">
          登録してはじめる
        </Button>
      </form>
      <p className="text-center text-sm text-ink-2">
        アカウントをお持ちの方は{" "}
        <Link href="/login" className="font-bold text-accent">
          ログイン
        </Link>
      </p>
    </Card>
  );
}
