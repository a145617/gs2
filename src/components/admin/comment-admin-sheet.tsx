"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ExternalLink, Eye, EyeOff, Pencil, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { ConfirmForm, MenuButton, StatusChip } from "./parts";

const MAX = 300;

export type AdminCommentTarget = {
  id: string;
  postId: string;
  body: string;
  status: "visible" | "hidden" | "deleted";
  author: { handle: string; displayName: string };
};

type Mode = "menu" | "edit" | "delete";

function CommentAdminPanel({
  comment,
  showLink,
  onChanged,
  onClose,
}: {
  comment: AdminCommentTarget;
  showLink: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [body, setBody] = useState(comment.body);
  const [status, setStatus] = useState(comment.status);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const act = (action: "hide" | "restore" | "delete", reason = "") =>
    api(`/api/admin/comments/${comment.id}`, { method: "POST", json: { action, reason } });

  async function toggleHidden() {
    setBusy(true);
    try {
      const next = status === "hidden" ? "restore" : "hide";
      await act(next);
      setStatus(next === "hide" ? "hidden" : "visible");
      toast.success(next === "hide" ? "コメントを非表示にしました" : "コメントを表示に戻しました");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/comments/${comment.id}`, { method: "PATCH", json: { body } });
      toast.success("コメントを編集しました");
      onChanged();
      setMode("menu");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <form onSubmit={save} className="flex flex-col gap-4" data-testid="admin-comment-edit">
        <TextArea label="コメント" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX} counter={`${body.length}/${MAX}`} rows={4} />
        <p className="px-1 text-xs text-ink-3">保存すると、書いた人に「管理者が編集した」ことが通知されます。</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setMode("menu")}>
            戻る
          </Button>
          <Button type="submit" variant="accent" className="flex-1" loading={busy} disabled={!body.trim()}>
            保存する
          </Button>
        </div>
      </form>
    );
  }
  if (mode === "delete") {
    return (
      <ConfirmForm
        danger
        description="このコメントを削除します。元に戻せません。書いた人には理由とともに通知されます。"
        confirmLabel="削除する"
        reasonLabel="削除の理由（書いた人に通知されます）"
        onConfirm={(reason) => act("delete", reason)}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success("コメントを削除しました");
          onChanged();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="admin-comment-panel">
      <div className="neu-inset neu-sm rounded-[18px] p-3">
        <p className="text-xs text-ink-3">
          {comment.author.displayName} @{comment.author.handle}
        </p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{body}</p>
        <div className="mt-2">{status === "hidden" ? <StatusChip tone="warn">非表示</StatusChip> : <StatusChip tone="ok">公開中</StatusChip>}</div>
      </div>
      <MenuButton icon={<Pencil size={18} />} onClick={() => setMode("edit")} testId="admin-comment-edit-open">
        内容を編集する
      </MenuButton>
      <MenuButton
        icon={busy ? <Spinner size={18} /> : status === "hidden" ? <Eye size={18} /> : <EyeOff size={18} />}
        onClick={toggleHidden}
        testId="admin-comment-toggle"
      >
        {status === "hidden" ? "表示に戻す" : "非表示にする"}
      </MenuButton>
      <MenuButton danger icon={<Trash size={18} />} onClick={() => setMode("delete")} testId="admin-comment-delete">
        削除する
      </MenuButton>
      {showLink && (
        <Link href={`/p/${comment.postId}#comments`} className="flex h-10 items-center justify-center gap-1.5 text-sm text-accent">
          <ExternalLink size={14} />
          投稿を開く
        </Link>
      )}
    </div>
  );
}

/** コメントの管理（編集・非表示・削除）のシート */
export function CommentAdminSheet({
  comment,
  onClose,
  onChanged,
  showLink = true,
}: {
  comment: AdminCommentTarget | null;
  onClose: () => void;
  onChanged?: () => void;
  showLink?: boolean;
}) {
  return (
    <Sheet open={!!comment} onClose={onClose} title="コメントの管理">
      {comment && (
        <CommentAdminPanel key={comment.id} comment={comment} showLink={showLink} onChanged={() => onChanged?.()} onClose={onClose} />
      )}
    </Sheet>
  );
}
