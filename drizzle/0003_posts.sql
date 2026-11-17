CREATE TYPE "public"."post_kind" AS ENUM('theme', 'event');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('visible', 'hidden', 'deleted');--> statement-breakpoint
CREATE TABLE "hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "post_hashtags" (
	"post_id" uuid NOT NULL,
	"hashtag_id" uuid NOT NULL,
	CONSTRAINT "post_hashtags_post_id_hashtag_id_pk" PRIMARY KEY("post_id","hashtag_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "post_kind" DEFAULT 'theme' NOT NULL,
	"theme_id" uuid,
	"event_id" uuid,
	"title" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"image_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"placeholder" text NOT NULL,
	"colors" jsonb NOT NULL,
	"meta" jsonb NOT NULL,
	"status" "post_status" DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"bookmark_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"edited_by_admin_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_hashtag_id_hashtags_id_fk" FOREIGN KEY ("hashtag_id") REFERENCES "public"."hashtags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_hashtags_tag_idx" ON "post_hashtags" USING btree ("hashtag_id");--> statement-breakpoint
CREATE INDEX "posts_theme_idx" ON "posts" USING btree ("theme_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_user_idx" ON "posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_event_idx" ON "posts" USING btree ("event_id");