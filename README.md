# ひとこま

毎朝5時に届く抽象的なお題に沿って写真を撮り、共有する写真SNSです（仕様は [spec.md](spec.md)）。

## 必要なもの

- Node.js 24 以上（開発は v26 で確認）
- それ以外のインストールは不要です（DBは組み込みPostgreSQLを使います）

## ローカルでの起動

```bash
npm install
cp .env.example .env.local     # 初回のみ
npm run db                     # 別ターミナルで起動したままにする（組み込みPostgreSQL）
npm run db:migrate             # DBのテーブルを作成・更新
npm run seed                   # 初期データ（管理者・お題候補）を投入
npm run dev                    # http://localhost:3000
```

## テスト

```bash
npm test          # 単体・統合テスト（npm run db が起動している必要があります）
npm run test:e2e  # ブラウザでのE2Eテスト（Chromium / Firefox / WebKit）
```

## ブランチ運用

`main` ← `develop` ← `feature/<機能名>` の git-flow で開発します。
`main` と `develop` には直接コミットせず、機能ごとに `feature/*` ブランチで作業し、
仕様書の要件に沿って動作確認ができたものを `develop` にマージします。
