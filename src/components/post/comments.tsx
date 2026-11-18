"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { Flag, Pencil, Send, ShieldCheck, Trash } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { formatRelative } from "@/lib/time";
import { ReportSheet } from "@/components/moderation/report-sheet";
import { CommentAdminSheet, type AdminCommentTarget } from "@/components/admin/comment-admin-sheet";
import { useMe } from "@/lib/client/session";
import type { CommentDTO, CommentPage, PostDTO } from "@/lib/types";

const MAX = 300;

function CommentItem({ c, onChanged, onAdmin }: { c: CommentDTO; onChanged: () => void; onAdmin?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const toast = useToast();

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/comments/${c.id}`, { method: "PATCH", json: { body } });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("このコメントを削除しますか？")) return;
    try {
      await api(`/api/comments/${c.id}`, { method: "DELETE" });
      toast.show("コメントを削除しました");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "削除できませんでした");
    }
  }

  return (
    <li className="flex gap-3" data-testid="comment">
      <Link href={`/u/${c.author.handle}`} className="shrink-0">
        <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={34} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
          <Link href={`/u/${c.author.handle}`} className="text-sm font-bold text-ink">
            {c.author.displayName}
          </Link>
          <span>@{c.author.handle}</span>
          <span>{formatRelative(c.createdAt)}</span>
          {c.editedAt && <span>（編集済み）</span>}
          {c.editedByAdmin && <span>（管理者が編集）</span>}
          {c.status === "hidden" && <span className="font-bold text-warn">非表示</span>}
        </p>
        {editing ? (
          <form onSubmit={save} className="mt-2 flex flex-col gap-2">
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={MAX} aria-label="コメントを編集" />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="accent" loading={busy}>
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                やめる
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-2" data-testid="comment-body">
            {c.body}
          </p>
        )}
        {!editing && (
          <div className="mt-1 flex gap-3 text-xs text-ink-3">
            {c.viewer.isMine && (
              <button type="button" className="inline-flex items-center gap-1" onClick={() => setEditing(true)}>
                <Pencil size={12} />
                編集
              </button>
            )}
            {c.viewer.canDelete && (
              <button type="button" className="inline-flex items-center gap-1" onClick={remove}>
                <Trash size={12} />
                削除
              </button>
            )}
            {!c.viewer.isMine && (
              <button type="button" className="inline-flex items-center gap-1" onClick={() => setReporting(true)}>
                <Flag size={12} />
                通報
              </button>
            )}
            {onAdmin && !c.viewer.isMine && (
              <button type="button" className="inline-flex items-center gap-1 text-accent" onClick={onAdmin} data-testid="admin-comment-menu">
                <ShieldCheck size={12} />
                管理
              </button>
            )}
          </div>
        )}
        <ReportSheet
          open={reporting}
          onClose={() => setReporting(false)}
          targetType="comment"
          targetId={c.id}
          onReported={(hidden) => hidden && onChanged()}
        />
      </div>
    </li>
  );
}

/** 投稿へのコメント（一覧と入力欄） */
export function Comments({ post }: { post: PostDTO }) {
  const key = `/api/posts/${post.id}/comments`;
  const { data, size, setSize, isLoading, mutate } = useSWRInfinite<CommentPage>((i, prev) => {
    if (i === 0) return key;
    if (!prev?.nextCursor) return null;
    return `${key}?cursor=${encodeURIComponent(prev.nextCursor)}`;
  });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [adminTarget, setAdminTarget] = useState<AdminCommentTarget | null>(null);
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const toast = useToast();
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = !!data?.[data.length - 1]?.nextCursor;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api(key, { method: "POST", json: { body } });
      setBody("");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "コメントできませんでした");
    } finally {
      setSending(false);
    }
  }

  if (post.locked) return null;

  return (
    <section id="comments" className="neu flex scroll-mt-24 flex-col gap-4 rounded-[24px] p-4" aria-label="コメント">
      <h2 className="text-sm font-bold text-ink-2">コメント {post.counts.comments > 0 && `（${post.counts.comments}）`}</h2>
      {isLoading ? (
        <div className="flex justify-center py-4 text-ink-3">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-3">まだコメントはありません。</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((c) => (
            <CommentItem
              key={c.id}
              c={c}
              onChanged={() => mutate()}
              onAdmin={isAdmin ? () => setAdminTarget({ id: c.id, postId: c.postId, body: c.body, status: c.status, author: c.author }) : undefined}
            />
          ))}
        </ul>
      )}
      {hasMore && (
        <Button size="sm" variant="ghost" onClick={() => setSize(size + 1)}>
          さらに表示
        </Button>
      )}
      {isAdmin && (
        <CommentAdminSheet comment={adminTarget} showLink={false} onClose={() => setAdminTarget(null)} onChanged={() => mutate()} />
      )}
      {post.status === "visible" && (
        <form onSubmit={send} className="flex items-end gap-2">
          <div className="flex-1">
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={MAX}
              placeholder="コメントを書く"
              aria-label="コメントを書く"
            />
          </div>
          <Button type="submit" variant="accent" loading={sending} disabled={!body.trim()} aria-label="コメントを送信" icon={<Send size={16} />} />
        </form>
      )}
    </section>
  );
}
