"use client";

import { useState } from "react";
import { UserRoundCog } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { Panel, useAfterSwitch, useDebugAction, type DebugStatus } from "./shared";

type Listing = { items: DebugStatus["testUsers"] };

/** テスト用ユーザーへの切り替え（別の人としての見え方・操作、管理者機能の確認） */
export function UsersPanel({ status, impersonating }: { status: DebugStatus; impersonating: boolean }) {
  const { busy, run } = useDebugAction();
  const [switching, setSwitching] = useState<string | null>(null);
  const toast = useToast();
  const afterSwitch = useAfterSwitch();

  async function switchTo(userId: string) {
    setSwitching(userId);
    try {
      const r = await api<{ user: { displayName: string } }>("/api/debug/switch", { method: "POST", json: { userId } });
      toast.success(`${r.user.displayName} に切り替えました`);
      await afterSwitch("/");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "切り替えられませんでした");
    } finally {
      setSwitching(null);
    }
  }

  async function switchToAdmin() {
    const r = await run("admin", () => api<Listing>("/api/debug/users", { method: "POST", json: { kind: "admin" } }));
    const admin = r?.items.find((u) => u.role === "admin");
    if (admin) await switchTo(admin.id);
  }

  return (
    <Panel
      id="users"
      icon={<UserRoundCog size={20} />}
      title="ユーザーの切り替え"
      description="ログインし直さずに、テスト用ユーザーとして操作できます（投稿前は他の人の投稿が見えないこと、フォロー・ミュート・通報など、別の人の視点が必要な確認に）。画面上部の「元に戻る」でいつでも戻れます。"
    >
      {status.testUsers.length === 0 ? (
        <p className="text-sm text-ink-2">テスト用ユーザーがいません。下のボタンか「テスト用のデータ」で作れます。</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="debug-user-list">
          {status.testUsers.map((u) => {
            const current = u.id === status.viewerId;
            return (
              <li key={u.id} className="neu-inset neu-sm flex items-center gap-3 rounded-[16px] px-3 py-2">
                <Avatar src={u.avatarUrl} name={u.displayName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">
                    {u.displayName}
                    {u.role === "admin" && <span className="ml-1.5 text-[11px] text-accent">管理者</span>}
                  </span>
                  <span className="block truncate text-xs text-ink-3">@{u.handle}</span>
                </span>
                {current ? (
                  <span className="text-xs font-bold text-accent">操作中</span>
                ) : (
                  <Button size="sm" loading={switching === u.id} onClick={() => switchTo(u.id)} data-testid="debug-switch">
                    切り替え
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          loading={busy === "add"}
          onClick={() =>
            run(
              "add",
              () => api<Listing>("/api/debug/users", { method: "POST", json: { kind: "users", count: Math.min(12, status.testUsers.filter((u) => u.role === "user").length + 3) } }),
              () => "テスト用ユーザーを追加しました",
            )
          }
          data-testid="debug-add-users"
        >
          ユーザーを3人追加
        </Button>
        <Button size="sm" loading={busy === "admin"} onClick={switchToAdmin} data-testid="debug-switch-admin">
          テスト管理者で操作
        </Button>
      </div>
      {impersonating && <p className="text-xs text-warn">いまはテスト用ユーザーとして操作しています。</p>}
      <p className="text-xs leading-relaxed text-ink-3">
        デバッグモードでは、だれでもテスト管理者として管理画面を確認できます。公開する環境では必ず DEBUG_MODE を false にしてください。
      </p>
    </Panel>
  );
}
