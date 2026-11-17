"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { KeyRound, LogOut, Monitor, Moon, Sun, Trash } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { AvatarEditor } from "@/components/settings/avatar-editor";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { TextArea, TextField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { PageSpinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { requestMotionPermission } from "@/components/shell/light-source";
import { api, ApiError } from "@/lib/client/api";
import { useDynamicLight, useThemeMode, type ThemeMode } from "@/lib/client/prefs";
import { useMe } from "@/lib/client/session";
import { LIMITS } from "@/lib/validation";
import type { Me, MeResponse } from "@/lib/types";

type Fields = Record<string, string>;
const fieldsOf = (err: unknown): Fields =>
  err instanceof ApiError ? ((err.details as { fields?: Fields } | undefined)?.fields ?? {}) : {};

export default function SettingsPage() {
  const { me, mutate } = useMe();
  if (!me) return <PageSpinner />;
  const update = (user: Me) => mutate((d) => (d ? ({ ...d, user } satisfies MeResponse) : d), { revalidate: false });
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <PageHeader title="設定" />
      <ProfileSection me={me} onUpdated={update} />
      <DisplaySection />
      <AccountSection me={me} />
    </div>
  );
}

function ProfileSection({ me, onUpdated }: { me: Me; onUpdated: (me: Me) => void }) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [errors, setErrors] = useState<Fields>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { mutate } = useSWRConfig();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api<{ user: Me }>("/api/me", { method: "PATCH", json: { displayName, bio } });
      onUpdated(res.user);
      await mutate(`/api/users/${me.handle}`);
      toast.success("プロフィールを保存しました");
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionTitle>プロフィール</SectionTitle>
      <Card className="flex flex-col gap-5">
        <AvatarEditor
          me={me}
          onUpdated={async (u) => {
            onUpdated(u);
            await mutate(`/api/users/${me.handle}`);
          }}
        />
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="ユーザー名"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={LIMITS.displayName}
            counter={`${displayName.length} / ${LIMITS.displayName}`}
            error={errors.displayName}
          />
          <TextField label="ユーザーID（自動で割り振られ、変更できません）" value={`@${me.handle}`} readOnly disabled />
          <TextArea
            label="自己紹介"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={LIMITS.bio}
            counter={`${bio.length} / ${LIMITS.bio}`}
            error={errors.bio}
            rows={3}
          />
          <Button type="submit" variant="accent" loading={saving}>
            保存する
          </Button>
        </form>
      </Card>
    </section>
  );
}

function DisplaySection() {
  const [mode, setMode] = useThemeMode();
  const [light, setLight] = useDynamicLight();
  return (
    <section>
      <SectionTitle>表示</SectionTitle>
      <Card className="flex flex-col gap-4">
        <Segmented<ThemeMode>
          ariaLabel="配色"
          value={mode}
          onChange={setMode}
          options={[
            { value: "system", label: <span className="inline-flex items-center gap-1"><Monitor size={14} />自動</span> },
            { value: "light", label: <span className="inline-flex items-center gap-1"><Sun size={14} />ライト</span> },
            { value: "dark", label: <span className="inline-flex items-center gap-1"><Moon size={14} />ダーク</span> },
          ]}
        />
        <Toggle
          checked={light}
          onChange={async (v) => {
            if (v) await requestMotionPermission();
            setLight(v);
          }}
          label="光の向きを動かす"
          description="端末の傾きや指の位置に合わせて、影とガラスの反射が動きます"
        />
      </Card>
    </section>
  );
}

function AccountSection({ me }: { me: Me }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await mutate(() => true, undefined, { revalidate: false });
    toast.show("ログアウトしました");
    router.replace("/login");
  }

  return (
    <section>
      <SectionTitle>アカウント</SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="px-1 text-sm text-ink-2">
          メールアドレス: <span className="break-all text-ink">{me.email}</span>
        </p>
        <Button icon={<KeyRound size={16} />} onClick={() => setPwOpen(true)}>
          パスワードを変更
        </Button>
        <Button icon={<LogOut size={16} />} onClick={logout}>
          ログアウト
        </Button>
        <Button variant="danger" icon={<Trash size={16} />} onClick={() => setDelOpen(true)}>
          アカウントを削除
        </Button>
      </Card>
      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <DeleteSheet open={delOpen} onClose={() => setDelOpen(false)} />
    </section>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api("/api/me/password", { method: "POST", json: { currentPassword, newPassword } });
      toast.success("パスワードを変更しました");
      setCurrent("");
      setNext("");
      onClose();
    } catch (err) {
      setErrors(fieldsOf(err));
      if (!Object.keys(fieldsOf(err)).length) toast.error(err instanceof ApiError ? err.message : "変更できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="パスワードを変更">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="現在のパスワード"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.currentPassword}
        />
        <TextField
          label="新しいパスワード"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
          error={errors.newPassword}
          hint={`${LIMITS.passwordMin}文字以上`}
        />
        <Button type="submit" variant="accent" loading={saving}>
          変更する
        </Button>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await api("/api/me", { method: "DELETE", json: { password } });
      await mutate(() => true, undefined, { revalidate: false });
      toast.show("アカウントを削除しました");
      router.replace("/signup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "削除できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="アカウントを削除">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          削除すると、プロフィールとこれまでの投稿は表示されなくなり、元に戻せません。確認のためパスワードを入力してください。
        </p>
        <TextField
          label="パスワード"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" variant="danger" loading={saving}>
          削除する
        </Button>
      </form>
    </Sheet>
  );
}
