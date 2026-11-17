"use client";

import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Volume2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import type { UserListPage } from "@/lib/types";

/** ミュートしているユーザーの一覧（解除できる） */
export function MutedUsers() {
  const { data, mutate } = useSWR<UserListPage>("/api/me/mutes");
  const { mutate: globalMutate } = useSWRConfig();
  const toast = useToast();
  const items = data?.items ?? [];

  async function unmute(handle: string, name: string) {
    try {
      await api(`/api/users/${encodeURIComponent(handle)}/mute`, { method: "DELETE" });
      toast.show(`${name}さんのミュートを解除しました`);
      await mutate();
      await globalMutate((key) => typeof key === "string" && key.startsWith("/api/") && key !== "/api/me/mutes");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "解除できませんでした");
    }
  }

  return (
    <section>
      <SectionTitle>ミュートしているユーザー</SectionTitle>
      <Card className="flex flex-col gap-3" data-testid="muted-users">
        {items.length === 0 ? (
          <p className="text-sm text-ink-3">ミュートしているユーザーはいません。ミュートすると、その人の投稿とコメントが表示されなくなります。</p>
        ) : (
          items.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={u.avatarUrl} name={u.displayName} size={36} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-ink">{u.displayName}</span>
                  <span className="truncate text-xs text-ink-3">@{u.handle}</span>
                </span>
              </Link>
              <Button size="sm" icon={<Volume2 size={14} />} onClick={() => unmute(u.handle, u.displayName)}>
                解除
              </Button>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
