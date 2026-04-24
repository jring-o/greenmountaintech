import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  pgView,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  numeric,
  customType,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/*  Custom type: tsvector                                              */
/* ------------------------------------------------------------------ */

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const sourceKindEnum = pgEnum('source_kind', ['whitelist', 'admin_added']);

export const adapterTypeEnum = pgEnum('adapter_type', ['ical', 'rss', 'html', 'json']);

export const trustLevelEnum = pgEnum('trust_level', ['auto_publish', 'review']);

export const eventStatusEnum = pgEnum('event_status', [
  'published',
  'pending_review',
  'rejected',
  'duplicate',
]);

export const eventCategoryEnum = pgEnum('event_category', [
  'music',
  'arts_theater',
  'food_drink',
  'community_civic',
  'outdoors_recreation',
  'family_kids',
  'education_lecture',
  'film',
  'sports',
  'farmers_market',
  'fundraiser',
  'tech',
  'other',
]);

export const regionEnum = pgEnum('region', [
  'burlington_area',
  'champlain_valley',
  'central_vt',
  'northeast_kingdom',
  'southern_vt',
  'statewide',
]);

export const runTriggerEnum = pgEnum('run_trigger', ['cron', 'manual']);

/* ------------------------------------------------------------------ */
/*  Table: sources                                                     */
/* ------------------------------------------------------------------ */

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    kind: sourceKindEnum('kind').notNull(),
    adapter_type: adapterTypeEnum('adapter_type').notNull(),
    adapter_key: text('adapter_key').notNull(),
    url: text('url').notNull(),
    adapter_config: jsonb('adapter_config')
      .notNull()
      .default(sql`'{}'::jsonb`),
    trust_level: trustLevelEnum('trust_level').notNull().default('review'),
    is_active: boolean('is_active').notNull().default(true),
    contact_url: text('contact_url'),
    rate_limit_per_min: integer('rate_limit_per_min').notNull().default(30),
    robots_respect: boolean('robots_respect').notNull().default(true),
    last_run_at: timestamp('last_run_at', { withTimezone: true }),
    last_run_status: text('last_run_status'),
    consecutive_failures: integer('consecutive_failures').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sources_is_active_kind_idx').on(table.is_active, table.kind),
    check(
      'sources_rate_limit_check',
      sql`${table.rate_limit_per_min} > 0 AND ${table.rate_limit_per_min} <= 600`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/*  Table: events                                                      */
/* ------------------------------------------------------------------ */

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source_id: uuid('source_id').references(() => sources.id, {
      onDelete: 'set null',
    }),
    external_id: text('external_id'),
    title: text('title').notNull(),
    description: text('description'),
    description_html: text('description_html'),
    starts_at_utc: timestamp('starts_at_utc', { withTimezone: true }).notNull(),
    ends_at_utc: timestamp('ends_at_utc', { withTimezone: true }),
    tzid: text('tzid').notNull().default('America/New_York'),
    all_day: boolean('all_day').notNull().default(false),
    venue_name: text('venue_name'),
    venue_address: text('venue_address'),
    region: regionEnum('region').notNull().default('statewide'),
    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }),
    url: text('url'),
    image_url: text('image_url'),
    status: eventStatusEnum('status').notNull(),
    category: eventCategoryEnum('category').notNull().default('other'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    dedupe_key: text('dedupe_key').notNull(),
    merged_into: uuid('merged_into'),
    dedup_candidates: jsonb('dedup_candidates')
      .notNull()
      .default(sql`'[]'::jsonb`),
    submitter_email: text('submitter_email'),
    submitter_ip_hash: text('submitter_ip_hash'),
    search_tsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))`,
    ),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    published_at: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('events_source_external_uniq')
      .on(table.source_id, table.external_id)
      .where(sql`${table.source_id} IS NOT NULL AND ${table.external_id} IS NOT NULL`),
    index('events_dedupe_key_idx').on(table.dedupe_key),
    index('events_status_starts_idx').on(table.status, table.starts_at_utc),
    index('events_region_starts_published_idx')
      .on(table.region, table.starts_at_utc)
      .where(sql`${table.status} = 'published'`),
    index('events_category_starts_published_idx')
      .on(table.category, table.starts_at_utc)
      .where(sql`${table.status} = 'published'`),
    index('events_tags_gin_idx').using('gin', table.tags),
    index('events_search_tsv_gin_idx').using('gin', table.search_tsv),
    index('events_merged_into_idx')
      .on(table.merged_into)
      .where(sql`${table.merged_into} IS NOT NULL`),
    check(
      'events_ends_after_starts',
      sql`${table.ends_at_utc} IS NULL OR ${table.ends_at_utc} >= ${table.starts_at_utc}`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/*  Table: ingestion_runs                                              */
/* ------------------------------------------------------------------ */

export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source_id: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    triggered_by: runTriggerEnum('triggered_by').notNull(),
    triggered_by_email: text('triggered_by_email'),
    items_found: integer('items_found').notNull().default(0),
    items_new: integer('items_new').notNull().default(0),
    items_updated: integer('items_updated').notNull().default(0),
    items_errored: integer('items_errored').notNull().default(0),
    items_dedup_skipped: integer('items_dedup_skipped').notNull().default(0),
    error_log: jsonb('error_log')
      .notNull()
      .default(sql`'[]'::jsonb`),
    duration_ms: integer('duration_ms'),
    status: text('status').notNull().default('running'),
  },
  (table) => [
    index('ingestion_runs_source_started_idx').on(table.source_id, table.started_at),
    index('ingestion_runs_started_idx').on(table.started_at),
  ],
);

/* ------------------------------------------------------------------ */
/*  Table: submission_rate_limits                                       */
/* ------------------------------------------------------------------ */

export const submissionRateLimits = pgTable('submission_rate_limits', {
  ip_hash: text('ip_hash').primaryKey(),
  count_1h: integer('count_1h').notNull().default(0),
  window_started_at: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Table: audit_log                                                   */
/* ------------------------------------------------------------------ */

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actor_email: text('actor_email').notNull(),
    action: text('action').notNull(),
    target_type: text('target_type').notNull(),
    target_id: uuid('target_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_target_idx').on(table.target_type, table.target_id, table.created_at),
  ],
);

/* ------------------------------------------------------------------ */
/*  View: source_health                                                */
/* ------------------------------------------------------------------ */

export const sourceHealth = pgView('source_health').as((qb) =>
  qb
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      is_active: sources.is_active,
      consecutive_failures: sources.consecutive_failures,
      runs_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days')`.as(
          'runs_30d',
        ),
      ok_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days' and ${ingestionRuns.status} = 'ok')`.as(
          'ok_30d',
        ),
      error_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days' and ${ingestionRuns.status} = 'error')`.as(
          'error_30d',
        ),
      last_run_at: sql<Date>`max(${ingestionRuns.started_at})`.as('last_run_at'),
      last_ok_at:
        sql<Date>`max(${ingestionRuns.started_at}) filter (where ${ingestionRuns.status} = 'ok')`.as(
          'last_ok_at',
        ),
    })
    .from(sources)
    .leftJoin(ingestionRuns, sql`${ingestionRuns.source_id} = ${sources.id}`)
    .groupBy(sources.id),
);

/* ------------------------------------------------------------------ */
/*  Inferred row types                                                 */
/* ------------------------------------------------------------------ */

export type SourceRow = typeof sources.$inferSelect;
export type NewSourceRow = typeof sources.$inferInsert;

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;

export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
export type NewIngestionRunRow = typeof ingestionRuns.$inferInsert;

export type SubmissionRateLimitRow = typeof submissionRateLimits.$inferSelect;
export type NewSubmissionRateLimitRow = typeof submissionRateLimits.$inferInsert;

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
