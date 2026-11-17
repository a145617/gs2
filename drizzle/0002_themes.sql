CREATE TYPE "public"."theme_source" AS ENUM('auto', 'admin', 'debug');--> statement-breakpoint
CREATE TYPE "public"."theme_template" AS ENUM('window', 'gallery', 'film', 'water', 'splash', 'dark', 'washi', 'kaleido', 'instant', 'prism', 'monitor', 'fog');--> statement-breakpoint
CREATE TABLE "theme_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template" "theme_template" NOT NULL,
	"accent" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_pool_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template" "theme_template" NOT NULL,
	"accent" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"day_key" text,
	"source" "theme_source" NOT NULL,
	"pool_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_day_key_unique" UNIQUE("day_key")
);
--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_pool_id_theme_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."theme_pool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "themes_starts_idx" ON "themes" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "themes_ends_idx" ON "themes" USING btree ("ends_at");