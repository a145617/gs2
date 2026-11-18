"use client";

import { useState } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";

/** フォロー / フォロー解除のボタン */
export function FollowButton({
  handle,
  following: initial,
  onChange,
  size = "sm",
}: {
  handle: string;
  following: boolean;
  onChange?: (following: boolean) => void;
  size?: "sm" | "md";
}) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function toggle() {
    setBusy(true);
    const next = !following;
    try {
      await api(`/api/users/${encodeURIComponent(handle)}/follow`, { method: next ? "POST" : "DELETE" });
      setFollowing(next);
      onChange?.(next);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size={size}
      variant={following ? "neu" : "accent"}
      loading={busy}
      onClick={toggle}
      aria-pressed={following}
      icon={following ? <UserCheck size={15} /> : <UserPlus size={15} />}
      data-testid="follow-button"
    >
      {following ? "フォロー中" : "フォローする"}
    </Button>
  );
}
