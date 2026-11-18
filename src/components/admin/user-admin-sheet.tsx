"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ExternalLink, Megaphone, Pencil, ShieldCheck, Trash, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { useMe } from "@/lib/client/session";
import { formatJstDateTime } from "@/lib/time";
import { LIMITS } from "@/lib/validation";
import { ConfirmForm, MenuButton, StatusChip } from "./parts";
import type { AdminUserDetail } from "./types";

type Mode = "menu" | "warn" | "profile" | "role" | "delete";
type Fields = Record<string, string>;

function ProfileForm({ detail, onSaved, onCancel }: { detail: AdminUserDetail; onSaved: () => void; onCancel: () => void }) {
  const u = detail.user;
  const [displayName, setDisplayName] = useState(u.displayName);
  const [bio, setBio] = useState(u.bio);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(`/api/admin/users/${u.id}`, { method: "POST", json: { action: "profile", displayName, bio, removeAvatar } });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors((err.details as { fields?: Fields } | undefined)?.fields ?? {});
        toast.error(err.message);
      } else toast.error("保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="admin-profile-form">
      <TextField
        label="ユーザー名"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={LIMITS.displayName}
        error={errors.displayName}
      />
      <TextArea label="自己紹介" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bio} error={errors.bio} rows={3} />
      {u.avatarUrl && (
        <Toggle checked={removeAvatar} onChange={setRemoveAvatar} label="アイコンを削除する" description="不適切なアイコン画像を取り除きます" />
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          戻る
        </Button>
        <Button type="submit" variant="accent" className="flex-1" loading={busy}>
          保存する
        </Button>
      </div>
    </form>
  );
}

function UserAdminPanel({ userId, onChanged, onClose }: { userId: string; onChanged: () => void; onClose: () => void }) {
  const { data, error, mutate } = useSWR<AdminUserDetail, ApiError>(`/api/admin/users/${userId}`);
  const { me } = useMe();
  const [mode, setMode] = useState<Mode>("menu");
  const toast = useToast();

  if (error) return <p className="py-6 text-center text-sm text-ink-3">アカウントを読み込めませんでした</p>;
  if (!data)
    return (
      <div className="flex justify-center py-8 text-ink-3">
        <Spinner />
      </div>
    );
  const u = data.user;
  const isSelf = me?.id === u.id;
  const deleted = u.status !== "active";
  const post = (json: unknown) => api(`/api/admin/users/${u.id}`, { method: "POST", json });
  const refresh = () => {
    void mutate();
    onChanged();
  };

  if (mode === "warn") {
    return (
      <ConfirmForm
        description="警告は、本人が「確認しました」を押すまで画面に表示され続けます。"
        confirmLabel="警告を送る"
        reasonLabel="警告の内容（本人に表示されます）"
        reasonPlaceholder="例: 他の利用者を傷つけるコメントが続いています。ガイドラインを守ってください。"
        reasonRequired
        onConfirm={(message) => post({ action: "warn", message })}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success("警告を送りました");
          refresh();
          setMode("menu");
        }}
      />
    );
  }
  if (mode === "profile") {
    return (
      <ProfileForm
        detail={data}
        onCancel={() => setMode("menu")}
        onSaved={() => {
          toast.success("プロフィールを修正しました");
          refresh();
          setMode("menu");
        }}
      />
    );
  }
  if (mode === "role") {
    const toAdmin = u.role !== "admin";
    return (
      <ConfirmForm
        description={
          toAdmin
            ? `${u.displayName} さんを管理者にします。投稿の削除やアカウントの削除など、すべての管理操作ができるようになります。`
            : `${u.displayName} さんを管理者から外します。`
        }
        confirmLabel={toAdmin ? "管理者にする" : "管理者から外す"}
        danger={!toAdmin}
        onConfirm={() => post({ action: "role", role: toAdmin ? "admin" : "user" })}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success(toAdmin ? "管理者にしました" : "管理者から外しました");
          refresh();
          setMode("menu");
        }}
      />
    );
  }
  if (mode === "delete") {
    return (
      <ConfirmForm
        danger
        description={
          <>
            {u.displayName}（@{u.handle}）のアカウントを削除します。投稿・コメントもすべて削除され、
            <strong className="text-danger">元に戻せません。</strong>
          </>
        }
        confirmLabel="アカウントを削除する"
        reasonLabel="削除の理由（操作の記録に残ります）"
        onConfirm={(reason) => post({ action: "delete", reason })}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success("アカウントを削除しました");
          onChanged();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="admin-user-panel">
      <div className="neu-inset neu-sm flex items-center gap-3 rounded-[18px] p-3">
        <Avatar src={u.avatarUrl} name={u.displayName} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{u.displayName}</p>
          <p className="truncate text-xs text-ink-3">
            @{u.handle} ・ {u.email}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {u.role === "admin" && <StatusChip tone="accent">管理者</StatusChip>}
            {deleted && <StatusChip tone="danger">削除済み</StatusChip>}
            {u.isTestUser && <StatusChip>テスト用</StatusChip>}
            <StatusChip>投稿 {data.postCount}</StatusChip>
            <StatusChip tone={data.warnings.length > 0 ? "warn" : "neutral"}>警告 {data.warnings.length}</StatusChip>
          </div>
        </div>
      </div>
      <p className="px-1 text-xs text-ink-3">登録: {formatJstDateTime(u.createdAt, true)}</p>
      {u.bio && <p className="px-1 text-sm whitespace-pre-wrap text-ink-2">{u.bio}</p>}

      {data.warnings.length > 0 && (
        <details className="neu-inset neu-sm rounded-[16px] px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-ink-2">これまでの警告（{data.warnings.length}件）</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {data.warnings.map((w) => (
              <li key={w.id} className="text-sm text-ink-2">
                <p className="whitespace-pre-wrap">{w.message}</p>
                <p className="text-xs text-ink-3">
                  {formatJstDateTime(w.createdAt, true)} ・ {w.acknowledgedAt ? "確認済み" : "未確認"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!deleted && (
        <>
          {!isSelf && (
            <MenuButton icon={<Megaphone size={18} />} onClick={() => setMode("warn")} testId="admin-user-warn">
              警告を送る
            </MenuButton>
          )}
          <MenuButton icon={<Pencil size={18} />} onClick={() => setMode("profile")} testId="admin-user-profile">
            プロフィールを修正する
          </MenuButton>
          {!isSelf && (
            <MenuButton icon={u.role === "admin" ? <UserX size={18} /> : <ShieldCheck size={18} />} onClick={() => setMode("role")}>
              {u.role === "admin" ? "管理者から外す" : "管理者にする"}
            </MenuButton>
          )}
          {!isSelf && (
            <MenuButton danger icon={<Trash size={18} />} onClick={() => setMode("delete")} testId="admin-user-delete">
              アカウントを削除する
            </MenuButton>
          )}
          <Link href={`/u/${u.handle}`} className="flex h-10 items-center justify-center gap-1.5 text-sm text-accent">
            <ExternalLink size={14} />
            プロフィールを開く
          </Link>
        </>
      )}
    </div>
  );
}

/** アカウントの管理（警告・プロフィールの修正・権限・削除）のシート */
export function UserAdminSheet({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged?: () => void }) {
  return (
    <Sheet open={!!userId} onClose={onClose} title="アカウントの管理">
      {userId && <UserAdminPanel key={userId} userId={userId} onChanged={() => onChanged?.()} onClose={onClose} />}
    </Sheet>
  );
}
