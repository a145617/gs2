"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ChevronLeft, Hash, Send } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { collectTags } from "@/lib/hashtags";
import { CAPTURE_MODE_LABEL, formatPhotoMeta, type PhotoMeta } from "@/lib/photo-meta";
import { POST_LIMITS } from "@/lib/validation";
import type { Developed } from "./develop-step";

export type PostFields = { title: string; caption: string; tags: string };

/** 投稿内容の入力（タイトル・キャプション・ハッシュタグ） */
export function DetailsStep({
  developed,
  meta,
  context,
  onBack,
  onSubmit,
  errors = {},
  submitting,
  defaultTitle = "",
}: {
  developed: Developed;
  meta: PhotoMeta;
  context: ReactNode;
  onBack: () => void;
  onSubmit: (f: PostFields) => void;
  errors?: Record<string, string>;
  submitting: boolean;
  defaultTitle?: string;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(developed.blob);
    const id = window.setTimeout(() => setUrl(u), 0);
    return () => {
      window.clearTimeout(id);
      URL.revokeObjectURL(u);
    };
  }, [developed.blob]);

  const tagPreview = useMemo(() => collectTags(tags, caption), [tags, caption]);
  const metaLine = formatPhotoMeta(meta);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ title, caption, tags });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center gap-3">
        <IconButton label="現像に戻る" onClick={onBack}>
          <ChevronLeft size={20} />
        </IconButton>
        <h1 className="flex-1 text-lg font-bold text-ink">投稿の内容</h1>
      </div>
      {context}
      <div className="neu flex gap-4 rounded-[22px] p-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- 端末内の画像（blob URL）
          <img
            src={url}
            alt="投稿する写真"
            className="h-28 w-28 shrink-0 rounded-2xl object-cover"
            data-testid="details-preview"
          />
        )}
        <div className="flex min-w-0 flex-col justify-center gap-1 text-xs text-ink-2">
          <span className="font-bold text-ink">{CAPTURE_MODE_LABEL[meta.mode]}</span>
          {metaLine.length > 0 ? <span>{metaLine.join(" ・ ")}</span> : <span className="text-ink-3">撮影情報なし</span>}
          {(meta.make || meta.model) && <span className="truncate text-ink-3">{[meta.make, meta.model].filter(Boolean).join(" ")}</span>}
          <span className="text-ink-3">
            {developed.width} × {developed.height}
          </span>
        </div>
      </div>
      <TextField
        label="タイトル"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={POST_LIMITS.title}
        counter={`${title.length} / ${POST_LIMITS.title}`}
        error={errors.title}
        placeholder="例：放課後の窓"
        required
      />
      <TextArea
        label="キャプション"
        name="caption"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={POST_LIMITS.caption}
        counter={`${caption.length} / ${POST_LIMITS.caption}`}
        error={errors.caption}
        placeholder="この一枚について。本文中の #タグ もハッシュタグになります"
        rows={4}
      />
      <TextField
        label="ハッシュタグ"
        name="tags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        error={errors.tags}
        placeholder="夕焼け 散歩道（空白区切り・10個まで）"
      />
      {tagPreview.length > 0 && (
        <ul className="-mt-2 flex flex-wrap gap-2 px-1" aria-label="付くハッシュタグ">
          {tagPreview.map((t) => (
            <li key={t} className="neu-inset neu-sm inline-flex items-center gap-0.5 rounded-full px-3 py-1 text-xs text-accent">
              <Hash size={11} />
              {t}
            </li>
          ))}
        </ul>
      )}
      <Button type="submit" variant="accent" size="lg" loading={submitting} icon={<Send size={17} />} data-testid="submit-post">
        投稿する
      </Button>
    </form>
  );
}
