ALTER TABLE "posts" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- 既存の投稿の検索用テキストを作る（タイトル・キャプション）
UPDATE "posts" SET "search_text" = lower("title" || ' ' || "caption") WHERE "search_text" = '';
