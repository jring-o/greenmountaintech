CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."adapter_type" AS ENUM('ical', 'rss', 'html', 'json');--> statement-breakpoint
CREATE TYPE "public"."event_category" AS ENUM('music', 'arts_theater', 'food_drink', 'community_civic', 'outdoors_recreation', 'family_kids', 'education_lecture', 'film', 'sports', 'farmers_market', 'fundraiser', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('published', 'pending_review', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('burlington_area', 'champlain_valley', 'central_vt', 'northeast_kingdom', 'southern_vt', 'statewide');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('whitelist', 'admin_added');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('auto_publish', 'review');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"external_id" text,
	"title" text NOT NULL,
	"description" text,
	"description_html" text,
	"starts_at_utc" timestamp with time zone NOT NULL,
	"ends_at_utc" timestamp with time zone,
	"tzid" text DEFAULT 'America/New_York' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"region" "region" DEFAULT 'statewide' NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"url" text,
	"image_url" text,
	"status" "event_status" NOT NULL,
	"category" "event_category" DEFAULT 'other' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"dedupe_key" text NOT NULL,
	"merged_into" uuid,
	"dedup_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitter_email" text,
	"submitter_ip_hash" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "events_ends_after_starts" CHECK ("events"."ends_at_utc" IS NULL OR "events"."ends_at_utc" >= "events"."starts_at_utc")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"triggered_by" "run_trigger" NOT NULL,
	"triggered_by_email" text,
	"items_found" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_errored" integer DEFAULT 0 NOT NULL,
	"items_dedup_skipped" integer DEFAULT 0 NOT NULL,
	"error_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"adapter_type" "adapter_type" NOT NULL,
	"adapter_key" text NOT NULL,
	"url" text NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trust_level" "trust_level" DEFAULT 'review' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"contact_url" text,
	"rate_limit_per_min" integer DEFAULT 30 NOT NULL,
	"robots_respect" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_unique" UNIQUE("name"),
	CONSTRAINT "sources_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sources_rate_limit_check" CHECK ("sources"."rate_limit_per_min" > 0 AND "sources"."rate_limit_per_min" <= 600)
);
--> statement-breakpoint
CREATE TABLE "submission_rate_limits" (
	"ip_hash" text PRIMARY KEY NOT NULL,
	"count_1h" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_source_external_uniq" ON "events" USING btree ("source_id","external_id") WHERE "events"."source_id" IS NOT NULL AND "events"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "events_dedupe_key_idx" ON "events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("status","starts_at_utc");--> statement-breakpoint
CREATE INDEX "events_region_starts_published_idx" ON "events" USING btree ("region","starts_at_utc") WHERE "events"."status" = 'published';--> statement-breakpoint
CREATE INDEX "events_category_starts_published_idx" ON "events" USING btree ("category","starts_at_utc") WHERE "events"."status" = 'published';--> statement-breakpoint
CREATE INDEX "events_tags_gin_idx" ON "events" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "events_search_tsv_gin_idx" ON "events" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "events_merged_into_idx" ON "events" USING btree ("merged_into") WHERE "events"."merged_into" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_started_idx" ON "ingestion_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_idx" ON "ingestion_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sources_is_active_kind_idx" ON "sources" USING btree ("is_active","kind");--> statement-breakpoint
CREATE VIEW "public"."source_health" AS (select "sources"."id", "sources"."name", "sources"."slug", "sources"."is_active", "sources"."consecutive_failures", count("ingestion_runs"."id") filter (where "ingestion_runs"."started_at" > now() - interval '30 days') as "runs_30d", count("ingestion_runs"."id") filter (where "ingestion_runs"."started_at" > now() - interval '30 days' and "ingestion_runs"."status" = 'ok') as "ok_30d", count("ingestion_runs"."id") filter (where "ingestion_runs"."started_at" > now() - interval '30 days' and "ingestion_runs"."status" = 'error') as "error_30d", max("ingestion_runs"."started_at") as "last_run_at", max("ingestion_runs"."started_at") filter (where "ingestion_runs"."status" = 'ok') as "last_ok_at" from "sources" left join "ingestion_runs" on "ingestion_runs"."source_id" = "sources"."id" group by "sources"."id");