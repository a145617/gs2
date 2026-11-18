"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ExternalLink, Eye, EyeOff, Pencil, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { extractTags } from "@/lib/hashtags";
import { formatJstDateTime } from "@/lib/time";
import { POST_LIMITS } from "@/lib/validation";
import type { PostDTO } from "@/lib/types";
import { ConfirmForm, MenuButton, StatusChip } from "./parts";

type Mode = "menu" | "edit" | "hide" | "delete";
type Fields = Record<string, string>;

/** 投稿の編集（管理者）。キャプション中の #タグ 以外のタグを入力欄に出す */
function PostEditForm({ post, onSaved, onCancel }: { post: PostDTO; onSaved: () => void; onCancel: () => void }) {
  const fromCaption = new Set(extractTags(post.caption));
  const [title, setTitle] = useState(post.title);
  const [caption, setCaption] = useState(post.caption);
  const [tags, setTags] = useState(
    post.tags
      .filter((t) => !fromCaption.has(t))
      .map((t) => `#${t}`)
      .join(" "),
  );
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api(`/api/admin/posts/${post.id}`, { method: "PATCH", json: { title, caption, tags } });
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
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="admin-post-edit">
      <TextField
        label="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={POST_LIMITS.title}
        counter={`${title.length}/${POST_LIMITS.title}`}
        error={errors.title}
      />
      <TextArea
        label="キャプション"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={POST_LIMITS.caption}
        counter={`${caption.length}/${POST_LIMITS.caption}`}
        error={errors.caption}
        rows={4}
      />
      <TextField
        label="ハッシュタグ"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        maxLength={POST_LIMITS.tagsInput}
        hint="空白で区切ります。キャプション中の #タグ も自動で付きます"
        error={errors.tags}
      />
      <p className="px-1 text-xs text-ink-3">保存すると、投稿者に「管理者が編集した」ことが通知されます。</p>
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

function PostAdminPanel({
  postId,
  showLink,
  onChanged,
  onDeleted,
}: {
  postId: string;
  showLink: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { data, error, mutate } = useSWR<{ post: PostDTO }, ApiError>(`/api/posts/${postId}`);
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (error) return <p className="py-6 text-center text-sm text-ink-3">投稿を読み込めませんでした（削除済みの可能性があります）</p>;
  if (!data)
    return (
      <div className="flex justify-center py-8 text-ink-3">
        <Spinner />
      </div>
    );
  const post = data.post;
  const hidden = post.status === "hidden";
  const act = (action: "hide" | "restore" | "delete", reason = "") =>
    api(`/api/admin/posts/${postId}`, { method: "POST", json: { action, reason } });
  const refresh = () => {
    void mutate();
    onChanged();
  };

  async function restore() {
    setBusy(true);
    try {
      await act("restore");
      toast.success("投稿を表示に戻しました");
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作できませんでした");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <PostEditForm
        post={post}
        onCancel={() => setMode("menu")}
        onSaved={() => {
          toast.success("投稿を編集しました");
          refresh();
          setMode("menu");
        }}
      />
    );
  }
  if (mode === "hide") {
    return (
      <ConfirmForm
        description="非表示にすると、投稿者と管理者以外には見えなくなります。あとで表示に戻せます。"
        confirmLabel="非表示にする"
        reasonLabel="理由（任意・操作の記録に残ります）"
        onConfirm={(reason) => act("hide", reason)}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success("投稿を非表示にしました");
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
            「{post.title}」を削除します。<strong className="text-danger">元に戻せません。</strong>
            投稿者には理由とともに通知されます。
          </>
        }
        confirmLabel="削除する"
        reasonLabel="削除の理由（投稿者に通知されます）"
        reasonPlaceholder="例: ガイドラインに反する内容が含まれていたため"
        onConfirm={(reason) => act("delete", reason)}
        onCancel={() => setMode("menu")}
        onDone={() => {
          toast.success("投稿を削除しました");
          onDeleted();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="admin-post-panel">
      <div className="neu-inset neu-sm flex gap-3 rounded-[18px] p-3">
        {post.image && (
          // eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する縮小画像
          <img src={post.image.sm} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{post.title}</p>
          <p className="truncate text-xs text-ink-3">
            {post.author.displayName} @{post.author.handle} ・ {formatJstDateTime(post.createdAt)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {hidden ? <StatusChip tone="warn">非表示</StatusChip> : <StatusChip tone="ok">公開中</StatusChip>}
            {post.editedByAdmin && <StatusChip>管理者が編集</StatusChip>}
          </div>
        </div>
      </div>
      <MenuButton icon={<Pencil size={18} />} onClick={() => setMode("edit")} testId="admin-post-edit-open">
        内容を編集する
      </MenuButton>
      {hidden ? (
        <MenuButton icon={busy ? <Spinner size={18} /> : <Eye size={18} />} onClick={restore} testId="admin-post-restore">
          表示に戻す
        </MenuButton>
      ) : (
        <MenuButton icon={<EyeOff size={18} />} onClick={() => setMode("hide")} testId="admin-post-hide">
          非表示にする
        </MenuButton>
      )}
      <MenuButton danger icon={<Trash size={18} />} onClick={() => setMode("delete")} testId="admin-post-delete">
        削除する
      </MenuButton>
      {showLink && (
        <Link href={`/p/${post.id}`} className="flex h-10 items-center justify-center gap-1.5 text-sm text-accent">
          <ExternalLink size={14} />
          投稿を開く
        </Link>
      )}
    </div>
  );
}

/** 投稿の管理（編集・非表示・削除）のシート。postId が null なら閉じている */
export function PostAdminSheet({
  postId,
  onClose,
  onChanged,
  onDeleted,
  showLink = true,
}: {
  postId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  onDeleted?: () => void;
  showLink?: boolean;
}) {
  return (
    <Sheet open={!!postId} onClose={onClose} title="投稿の管理">
      {postId && (
        <PostAdminPanel
          key={postId}
          postId={postId}
          showLink={showLink}
          onChanged={() => onChanged?.()}
          onDeleted={() => {
            onChanged?.();
            (onDeleted ?? onClose)();
          }}
        />
      )}
    </Sheet>
  );
}
