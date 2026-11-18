"use client";

import { AdminOnly } from "@/components/admin/admin-frame";
import { useState } from "react";
import type { FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { PageSpinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import type { AdminSettings } from "@/components/admin/types";
import { api, ApiError } from "@/lib/client/api";

type Fields = Record<string, string>;

function SettingsForm({ data, onSaved }: { data: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [limited, setLimited] = useState(data.dailyPostLimit !== null);
  const [limit, setLimit] = useState(String(data.dailyPostLimit ?? 3));
  const [autoHide, setAutoHide] = useState(data.autoHideReports > 0);
  const [threshold, setThreshold] = useState(String(data.autoHideReports > 0 ? data.autoHideReports : 3));
  const [errors, setErrors] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const res = await api<AdminSettings>("/api/admin/settings", {
        method: "PATCH",
        json: {
          dailyPostLimit: limited ? Math.round(Number(limit)) : null,
          autoHideReports: autoHide ? Math.round(Number(threshold)) : 0,
        },
      });
      toast.success("設定を保存しました");
      onSaved(res);
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
    <form onSubmit={submit} className="flex flex-col gap-6" data-testid="admin-settings">
      <section>
        <SectionTitle>投稿</SectionTitle>
        <Card className="flex flex-col gap-3 p-4">
          <Toggle
            checked={limited}
            onChange={setLimited}
            label="1日の投稿数に上限を設ける"
            description="オフなら、1つのお題に何枚でも投稿できます"
          />
          {limited && (
            <TextField
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              label="1日（お題1つ）あたりの上限"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              error={errors.dailyPostLimit}
              data-testid="daily-limit"
            />
          )}
        </Card>
      </section>
      <section>
        <SectionTitle>通報</SectionTitle>
        <Card className="flex flex-col gap-3 p-4">
          <Toggle
            checked={autoHide}
            onChange={setAutoHide}
            label="通報が集まったら自動で非表示にする"
            description="管理者が確認するまで、投稿・コメントを一時的に隠します"
          />
          {autoHide && (
            <TextField
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              label="非表示にする通報の件数"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              error={errors.autoHideReports}
            />
          )}
        </Card>
      </section>
      <Button type="submit" variant="accent" loading={busy} data-testid="settings-save">
        保存する
      </Button>
    </form>
  );
}

/** アプリ全体の設定（投稿数の上限・通報による自動非表示） */
function AdminSettingsContent() {
  const { data, mutate } = useSWR<AdminSettings>("/api/admin/settings");
  const { mutate: globalMutate } = useSWRConfig();
  if (!data) return <PageSpinner />;
  return (
    <div className="flex flex-col gap-4 animate-fade-up">
      <PageHeader title="設定" subtitle="アプリ全体の設定（イベントの自動開催はイベントの画面で）" back="/admin" />
      <SettingsForm
        key={`${data.dailyPostLimit}-${data.autoHideReports}`}
        data={data}
        onSaved={(s) => {
          void mutate(s, { revalidate: false });
          void globalMutate("/api/themes/current");
        }}
      />
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminOnly>
      <AdminSettingsContent />
    </AdminOnly>
  );
}
