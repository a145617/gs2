"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, TextArea, TextField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/client/api";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "@/lib/templates";
import { fromJstInputValue, nextThemeChange, toJstInputValue } from "@/lib/time";
import { THEME_LIMITS } from "@/lib/validation";
import type { ThemeDTO } from "@/lib/types";

type Fields = Record<string, string>;
const fieldsOf = (err: unknown): Fields =>
  err instanceof ApiError ? ((err.details as { fields?: Fields } | undefined)?.fields ?? {}) : {};

/** お題の内容（お題・説明・表示テンプレート・色）の入力欄 */
function ThemeContentFields({
  title,
  setTitle,
  description,
  setDescription,
  template,
  setTemplate,
  accent,
  setAccent,
  errors,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  template: TemplateKey;
  setTemplate: (v: TemplateKey) => void;
  accent: string;
  setAccent: (v: string) => void;
  errors: Fields;
}) {
  return (
    <>
      <TextField
        label="お題"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={THEME_LIMITS.title}
        counter={`${title.length}/${THEME_LIMITS.title}`}
        placeholder="例: ひかり"
        error={errors.title}
        data-testid="theme-title"
      />
      <TextArea
        label="説明（任意）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={THEME_LIMITS.description}
        rows={2}
        placeholder="例: 光そのもの、光が作る影、光を感じるものを撮ってみよう"
        error={errors.description}
      />
      <Select
        label="表示テンプレート（このお題の投稿の見せ方）"
        value={template}
        onChange={(e) => {
          const t = e.target.value as TemplateKey;
          setTemplate(t);
          setAccent(TEMPLATES[t].accent);
        }}
        hint={TEMPLATES[template].description}
        data-testid="theme-template"
      >
        {TEMPLATE_KEYS.map((k) => (
          <option key={k} value={k}>
            {TEMPLATES[k].name}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-3 px-1">
        <label className="flex items-center gap-3 text-[13px] font-bold text-ink-2">
          お題の色
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="neu neu-sm h-10 w-14 cursor-pointer rounded-xl border-0 bg-transparent p-1"
            aria-label="お題の色"
          />
        </label>
        <span className="text-xs text-ink-3">アプリ全体のアクセント色になります</span>
        <Link href="/design/templates" className="ml-auto text-xs text-accent">
          テンプレートの見本
        </Link>
      </div>
    </>
  );
}

/** お題を出す（今すぐ・日時を指定して予約） */
export function ThemeCreateForm({ serverNow, onCreated }: { serverNow: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("window");
  const [accent, setAccent] = useState(TEMPLATES.window.accent);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const now = new Date(serverNow);
  const [startsAt, setStartsAt] = useState(() => toJstInputValue(nextThemeChange(now)));
  const [endsAt, setEndsAt] = useState("");
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const start = mode === "schedule" ? fromJstInputValue(startsAt) : null;
    if (mode === "schedule" && !start) {
      setErrors({ startsAt: "開始日時を入力してください" });
      return;
    }
    const end = endsAt ? fromJstInputValue(endsAt) : null;
    setBusy(true);
    try {
      await api("/api/admin/themes", {
        method: "POST",
        json: {
          mode,
          title,
          description,
          template,
          accent,
          ...(start ? { startsAt: start } : {}),
          ...(end ? { endsAt: end } : {}),
        },
      });
      toast.success(mode === "now" ? `お題「${title.trim()}」を開始しました` : `お題「${title.trim()}」を予約しました`);
      setTitle("");
      setDescription("");
      setEndsAt("");
      onCreated();
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "お題を出せませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="theme-create">
      <ThemeContentFields
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        template={template}
        setTemplate={setTemplate}
        accent={accent}
        setAccent={setAccent}
        errors={errors}
      />
      <Segmented
        ariaLabel="開始のタイミング"
        value={mode}
        onChange={setMode}
        options={[
          { value: "now", label: "今すぐ開始" },
          { value: "schedule", label: "日時を指定" },
        ]}
      />
      {mode === "schedule" && (
        <TextField
          type="datetime-local"
          label="開始日時（日本時間）"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          error={errors.startsAt}
          data-testid="theme-starts"
        />
      )}
      <TextField
        type="datetime-local"
        label="終了日時（日本時間・任意）"
        value={endsAt}
        onChange={(e) => setEndsAt(e.target.value)}
        hint="空欄なら、開始後の最初の朝5時に次のお題へ切り替わります"
        error={errors.endsAt}
      />
      <Button type="submit" variant="accent" loading={busy} disabled={!title.trim()} data-testid="theme-submit">
        {mode === "now" ? "このお題を今すぐ開始する" : "このお題を予約する"}
      </Button>
    </form>
  );
}

/** お題の編集（内容と期間） */
export function ThemeEditForm({ theme, onSaved, onCancel }: { theme: ThemeDTO; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(theme.title);
  const [description, setDescription] = useState(theme.description);
  const [template, setTemplate] = useState<TemplateKey>(theme.template);
  const [accent, setAccent] = useState(theme.accent);
  const [startsAt, setStartsAt] = useState(toJstInputValue(theme.startsAt));
  const [endsAt, setEndsAt] = useState(toJstInputValue(theme.endsAt));
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // 編集できるのは現在のお題と予約中のお題。予約中なら開始日時も変えられる
  const upcoming = !theme.isCurrent;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const start = fromJstInputValue(startsAt);
    const end = fromJstInputValue(endsAt);
    setBusy(true);
    try {
      await api(`/api/admin/themes/${theme.id}`, {
        method: "PATCH",
        json: {
          title,
          description,
          template,
          accent,
          ...(upcoming && start ? { startsAt: start } : {}),
          ...(end ? { endsAt: end } : {}),
        },
      });
      toast.success("お題を変更しました");
      onSaved();
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="theme-edit">
      <ThemeContentFields
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        template={template}
        setTemplate={setTemplate}
        accent={accent}
        setAccent={setAccent}
        errors={errors}
      />
      {upcoming && (
        <TextField type="datetime-local" label="開始日時（日本時間）" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} />
      )}
      <TextField type="datetime-local" label="終了日時（日本時間）" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} />
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

/** 自動出題のお題候補の追加 */
export function PoolAddForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("window");
  const [accent, setAccent] = useState(TEMPLATES.window.accent);
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      await api("/api/admin/theme-pool", { method: "POST", json: { title, description, template, accent } });
      toast.success(`「${title.trim()}」を候補に追加しました`);
      setTitle("");
      setDescription("");
      onAdded();
    } catch (err) {
      setErrors(fieldsOf(err));
      toast.error(err instanceof ApiError ? err.message : "追加できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ThemeContentFields
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        template={template}
        setTemplate={setTemplate}
        accent={accent}
        setAccent={setAccent}
        errors={errors}
      />
      <Button type="submit" loading={busy} disabled={!title.trim()}>
        候補に追加する
      </Button>
    </form>
  );
}
