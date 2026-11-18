"use client";

import { PageHeader } from "@/components/shell/page-header";
import { ThemeStage } from "@/components/stage/theme-stage";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/templates";
import { DEFAULT_THEME_POOL } from "@/server/seed/theme-pool";

/** お題の表示テンプレートの見本（12種類） */
export default function TemplatesPage() {
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <PageHeader title="表示テンプレート" subtitle="お題ごとに、投稿の見せ方が変わります" />
      <p className="-mt-4 px-1 text-xs text-ink-3">見本の写真: 「海に沈む夕日」Sebastien Gabriel（Unsplash）</p>
      {TEMPLATE_KEYS.map((key) => {
        const examples = DEFAULT_THEME_POOL.filter((t) => t.template === key).map((t) => t.title);
        const accent = DEFAULT_THEME_POOL.find((t) => t.template === key)?.accent ?? TEMPLATES[key].accent;
        return (
          <section key={key} className="flex flex-col gap-3" data-testid={`template-${key}`}>
            <div className="px-1">
              <h2 className="font-display text-lg font-bold text-ink">{TEMPLATES[key].name}</h2>
              <p className="text-xs text-ink-3">{TEMPLATES[key].description}</p>
              <p className="text-xs text-ink-3">お題の例: {examples.join("・")}</p>
            </div>
            <ThemeStage
              template={key}
              accent={accent}
              src="/samples/sunset-sea.jpg"
              width={1200}
              height={800}
              title="海に沈む夕日"
              authorName="Sebastien Gabriel"
              dayLabel="11月18日"
              variant="detail"
            />
          </section>
        );
      })}
    </div>
  );
}
