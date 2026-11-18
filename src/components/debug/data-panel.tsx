"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { api } from "@/lib/client/api";
import { InfoRow, Panel, useDebugAction, type DebugStatus } from "./shared";

type SeedResult = { users: number; posts: number; matched: number; likes: number; comments: number; follows: number };
type ReportResult = { title: string; sent: number; autoHidden: boolean };

/** テスト用のデータ（ほかの人の投稿・いいね・コメント・フォロー・通報）を作る／消す */
export function DataPanel({ status, impersonating }: { status: DebugStatus; impersonating: boolean }) {
  const { busy, run } = useDebugAction();
  const [users, setUsers] = useState(6);
  const [per, setPer] = useState(2);

  return (
    <Panel
      id="data"
      icon={<Database size={20} />}
      title="テスト用のデータ"
      description="ほかの人の投稿がないと確認できない機能（投稿後の閲覧・いいね・コメント・フィードの並び・検索・お知らせなど）のために、テスト用ユーザーとその投稿を作ります。写真は Unsplash の100枚から、今日のお題に合うものを優先して使います（撮影者はキャプションに表示）。"
    >
      <div>
        <InfoRow label="テスト用ユーザー" testId="debug-test-users">
          {status.testUsers.length}人
        </InfoRow>
        <InfoRow label="テスト用ユーザーの投稿" testId="debug-test-posts">
          {status.testPosts}件
        </InfoRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="人数" value={String(users)} onChange={(e) => setUsers(Number(e.target.value))}>
          {[2, 4, 6, 8, 12].map((n) => (
            <option key={n} value={n}>
              {n}人
            </option>
          ))}
        </Select>
        <Select label="1人あたりの投稿" value={String(per)} onChange={(e) => setPer(Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}枚
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="accent"
        loading={busy === "seed"}
        onClick={() =>
          run(
            "seed",
            () => api<SeedResult>("/api/debug/seed", { method: "POST", json: { users, postsPerUser: per } }),
            (r) => `${r.users}人が今日のお題に${r.posts}枚投稿し（お題に合う写真 ${r.matched}枚）、いいね${r.likes}・コメント${r.comments}・フォロー${r.follows}を付けました`,
          )
        }
        data-testid="debug-seed"
      >
        今日のお題にダミーの投稿を作る
      </Button>
      <p className="text-xs leading-relaxed text-ink-3">
        あなたもテスト用ユーザーの2人をフォローし、2人にフォローされます。今日のお題に投稿済みなら、その投稿にいいね・コメントが付きます（お知らせの確認用）。
      </p>
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          loading={busy === "report"}
          onClick={() =>
            run(
              "report",
              () => api<ReportResult>("/api/debug/reports", { method: "POST", json: { count: 3 } }),
              (r) =>
                r.sent === 0
                  ? `「${r.title}」はすでにテスト用ユーザーから通報されています`
                  : `「${r.title}」に${r.sent}件の通報が届きました${r.autoHidden ? "（自動で非表示になりました）" : ""}`,
            )
          }
          data-testid="debug-report"
        >
          自分の最新の投稿に、テスト用ユーザーから通報を3件送る
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={impersonating || status.testUsers.length === 0}
          loading={busy === "purge"}
          onClick={() => {
            if (!window.confirm("テスト用ユーザーと、その投稿・コメント・いいね・フォローをすべて削除しますか？")) return;
            void run(
              "purge",
              () => api<{ users: number; posts: number }>("/api/debug/seed", { method: "DELETE" }),
              (r) => `テスト用ユーザー${r.users}人と投稿${r.posts}件を削除しました`,
            );
          }}
          data-testid="debug-purge"
        >
          テスト用データをすべて削除
        </Button>
      </div>
    </Panel>
  );
}
