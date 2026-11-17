"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Hash, Search, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ThemeArchive } from "@/components/theme/theme-archive";
import { PostGrid } from "@/components/post/post-grid";
import { UserList } from "@/components/profile/user-list";
import { Segmented } from "@/components/ui/segmented";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";

type Tab = "posts" | "users" | "tags";
type TagItem = { name: string; postCount: number };

function TagChips({ items, testId }: { items: TagItem[]; testId?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid={testId}>
      {items.map((t) => (
        <li key={t.name}>
          <Link
            href={`/tags/${encodeURIComponent(t.name)}`}
            className="neu neu-sm neu-convex neu-press inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm text-ink-2"
          >
            <Hash size={13} className="text-accent" />
            {t.name}
            <span className="text-xs text-ink-3">{t.postCount}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 検索欄（すりガラス）。非制御の入力欄にして、画面の準備前に入力した文字も消えないようにする */
function SearchForm({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(initial.length > 0);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSearch(String(new FormData(e.currentTarget).get("q") ?? ""));
  }
  return (
    <form onSubmit={onSubmit} role="search" className="glass glass-sheen flex items-center gap-2 rounded-[20px] py-1.5 pr-1.5 pl-4">
      <Search size={18} className="shrink-0 text-ink-3" />
      <input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={initial}
        onChange={(e) => setHasText(e.target.value.length > 0)}
        placeholder="タイトル・キャプション・#ハッシュタグ・ユーザー"
        aria-label="検索"
        enterKeyHint="search"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
        data-testid="search-input"
      />
      {hasText && (
        <button
          type="button"
          aria-label="入力を消す"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            setHasText(false);
            onSearch("");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3"
        >
          <X size={16} />
        </button>
      )}
      <button type="submit" className="neu-accent neu-sm neu-press h-10 rounded-[14px] px-4 text-sm font-bold">
        検索
      </button>
    </form>
  );
}

/** さがす: 投稿（タイトル・キャプション・ハッシュタグ）・ユーザー・タグの検索と、これまでのお題 */
export function ExplorePage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("q") ?? "";
  const tab = (params.get("type") as Tab | null) ?? "posts";

  function go(nextQ: string, nextTab: Tab = tab) {
    const sp = new URLSearchParams();
    if (nextQ.trim()) sp.set("q", nextQ.trim());
    if (nextTab !== "posts") sp.set("type", nextTab);
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`);
  }

  const trending = useSWR<{ items: TagItem[] }>(q ? null : "/api/search?type=trending");
  const tagResults = useSWR<{ items: TagItem[] }>(q && tab === "tags" ? `/api/search?type=tags&q=${encodeURIComponent(q)}` : null);

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title="さがす" back={false} />
      {/* URL の検索語が変わったときだけ入力欄を作り直す（入力中の文字を上書きしない） */}
      <SearchForm key={q} initial={q} onSearch={(v) => go(v)} />

      {q ? (
        <>
          <Segmented<Tab>
            ariaLabel="検索の種類"
            value={tab}
            onChange={(t) => go(q, t)}
            options={[
              { value: "posts", label: "投稿" },
              { value: "users", label: "ユーザー" },
              { value: "tags", label: "タグ" },
            ]}
          />
          {tab === "posts" && (
            <PostGrid
              key={q}
              endpoint={`/api/search?type=posts&q=${encodeURIComponent(q)}`}
              emptyText={`「${q}」に一致する投稿は見つかりませんでした`}
            />
          )}
          {tab === "users" && (
            <UserList key={q} endpoint={`/api/search?type=users&q=${encodeURIComponent(q)}`} emptyText="ユーザーが見つかりませんでした" />
          )}
          {tab === "tags" &&
            (tagResults.data && tagResults.data.items.length === 0 ? (
              <EmptyState icon={<Hash size={24} />} title="ハッシュタグが見つかりませんでした" />
            ) : (
              <TagChips items={tagResults.data?.items ?? []} testId="tag-results" />
            ))}
        </>
      ) : (
        <>
          {trending.data && trending.data.items.length > 0 && (
            <section>
              <SectionTitle>よく使われているハッシュタグ</SectionTitle>
              <TagChips items={trending.data.items} testId="trending-tags" />
            </section>
          )}
          <ThemeArchive />
        </>
      )}
    </div>
  );
}
