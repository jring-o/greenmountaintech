/**
 * Additional coverage tests for lib/db/schema.ts
 *
 * These tests complement schema.test.ts by filling gaps in:
 * - Enum SQL-level names
 * - Detailed column types, nullability, and defaults for all tables
 * - View column selection verification
 * - Constraint and index count verification
 * - Migration SQL conditional WHERE clauses and view content
 */
import fs from 'node:fs';
import path from 'node:path';

import { getTableName } from 'drizzle-orm';
import { getTableConfig, getViewConfig } from 'drizzle-orm/pg-core';
import { describe, it, expect } from 'vitest';

import {
  sourceKindEnum,
  adapterTypeEnum,
  trustLevelEnum,
  eventStatusEnum,
  eventCategoryEnum,
  regionEnum,
  runTriggerEnum,
  sources,
  events,
  ingestionRuns,
  submissionRateLimits,
  auditLog,
  sourceHealth,
} from '@/lib/db/schema';

type ColumnConfig = ReturnType<typeof getTableConfig>['columns'][number];
type ColMap = Record<string, ColumnConfig | undefined>;

function col(map: ColMap, name: string): ColumnConfig {
  const c = map[name];
  if (!c) throw new Error(`Column "${name}" not found`);
  return c;
}

/* ------------------------------------------------------------------ */
/*  14. Enum SQL-level names                                           */
/* ------------------------------------------------------------------ */

describe('Enum SQL-level names', () => {
  it('source_kind enum has SQL name "source_kind"', () => {
    expect(sourceKindEnum.enumName).toBe('source_kind');
  });

  it('adapter_type enum has SQL name "adapter_type"', () => {
    expect(adapterTypeEnum.enumName).toBe('adapter_type');
  });

  it('trust_level enum has SQL name "trust_level"', () => {
    expect(trustLevelEnum.enumName).toBe('trust_level');
  });

  it('event_status enum has SQL name "event_status"', () => {
    expect(eventStatusEnum.enumName).toBe('event_status');
  });

  it('event_category enum has SQL name "event_category"', () => {
    expect(eventCategoryEnum.enumName).toBe('event_category');
  });

  it('region enum has SQL name "region"', () => {
    expect(regionEnum.enumName).toBe('region');
  });

  it('run_trigger enum has SQL name "run_trigger"', () => {
    expect(runTriggerEnum.enumName).toBe('run_trigger');
  });
});

/* ------------------------------------------------------------------ */
/*  15. sources -- detailed column type/nullability/default coverage   */
/* ------------------------------------------------------------------ */

describe('sources -- column details', () => {
  const config = getTableConfig(sources);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('adapter_key is not null text', () => {
    const c = col(colMap, 'adapter_key');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgText');
  });

  it('url is not null text', () => {
    const c = col(colMap, 'url');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgText');
  });

  it('adapter_config is not null jsonb with default', () => {
    const c = col(colMap, 'adapter_config');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgJsonb');
    expect(c.hasDefault).toBe(true);
  });

  it('trust_level defaults to review', () => {
    const c = col(colMap, 'trust_level');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe('review');
  });

  it('robots_respect is not null boolean with default true', () => {
    const c = col(colMap, 'robots_respect');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgBoolean');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(true);
  });

  it('consecutive_failures defaults to 0', () => {
    const c = col(colMap, 'consecutive_failures');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgInteger');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(0);
  });

  it('rate_limit_per_min is integer defaulting to 30', () => {
    const c = col(colMap, 'rate_limit_per_min');
    expect(c.columnType).toBe('PgInteger');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(30);
  });

  it('contact_url is nullable text', () => {
    const c = col(colMap, 'contact_url');
    expect(c.notNull).toBe(false);
    expect(c.columnType).toBe('PgText');
  });

  it('last_run_at is nullable timestamptz', () => {
    const c = col(colMap, 'last_run_at');
    expect(c.notNull).toBe(false);
    expect(c.columnType).toBe('PgTimestamp');
  });

  it('last_run_status is nullable text', () => {
    const c = col(colMap, 'last_run_status');
    expect(c.notNull).toBe(false);
    expect(c.columnType).toBe('PgText');
  });

  it('is_active defaults to true', () => {
    const c = col(colMap, 'is_active');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(true);
  });

  it('created_at is PgTimestamp', () => {
    expect(col(colMap, 'created_at').columnType).toBe('PgTimestamp');
  });

  it('updated_at is PgTimestamp', () => {
    expect(col(colMap, 'updated_at').columnType).toBe('PgTimestamp');
  });

  it('id has a default (gen_random_uuid)', () => {
    expect(col(colMap, 'id').hasDefault).toBe(true);
  });

  it('name and slug are PgText', () => {
    expect(col(colMap, 'name').columnType).toBe('PgText');
    expect(col(colMap, 'slug').columnType).toBe('PgText');
  });
});

/* ------------------------------------------------------------------ */
/*  16. events -- detailed column type/nullability/default coverage    */
/* ------------------------------------------------------------------ */

describe('events -- column details', () => {
  const config = getTableConfig(events);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('id is uuid PK with default', () => {
    const c = col(colMap, 'id');
    expect(c.primary).toBe(true);
    expect(c.columnType).toBe('PgUUID');
    expect(c.hasDefault).toBe(true);
  });

  it('external_id is nullable text', () => {
    expect(col(colMap, 'external_id').notNull).toBe(false);
    expect(col(colMap, 'external_id').columnType).toBe('PgText');
  });

  it('description is nullable text', () => {
    expect(col(colMap, 'description').notNull).toBe(false);
    expect(col(colMap, 'description').columnType).toBe('PgText');
  });

  it('description_html is nullable text', () => {
    expect(col(colMap, 'description_html').notNull).toBe(false);
    expect(col(colMap, 'description_html').columnType).toBe('PgText');
  });

  it('tzid defaults to America/New_York', () => {
    const c = col(colMap, 'tzid');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe('America/New_York');
  });

  it('all_day defaults to false', () => {
    const c = col(colMap, 'all_day');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgBoolean');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(false);
  });

  it('venue_name is nullable', () => {
    expect(col(colMap, 'venue_name').notNull).toBe(false);
  });

  it('venue_address is nullable', () => {
    expect(col(colMap, 'venue_address').notNull).toBe(false);
  });

  it('region defaults to statewide', () => {
    const c = col(colMap, 'region');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe('statewide');
  });

  it('lat and lng are nullable', () => {
    expect(col(colMap, 'lat').notNull).toBe(false);
    expect(col(colMap, 'lng').notNull).toBe(false);
  });

  it('url is nullable text', () => {
    expect(col(colMap, 'url').notNull).toBe(false);
    expect(col(colMap, 'url').columnType).toBe('PgText');
  });

  it('image_url is nullable text', () => {
    expect(col(colMap, 'image_url').notNull).toBe(false);
    expect(col(colMap, 'image_url').columnType).toBe('PgText');
  });

  it('category defaults to other', () => {
    const c = col(colMap, 'category');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe('other');
  });

  it('tags is not null array with default', () => {
    const c = col(colMap, 'tags');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.columnType).toBe('PgArray');
  });

  it('dedupe_key is not null text', () => {
    expect(col(colMap, 'dedupe_key').notNull).toBe(true);
    expect(col(colMap, 'dedupe_key').columnType).toBe('PgText');
  });

  it('merged_into is nullable uuid', () => {
    expect(col(colMap, 'merged_into').notNull).toBe(false);
    expect(col(colMap, 'merged_into').columnType).toBe('PgUUID');
  });

  it('dedup_candidates is not null jsonb with default', () => {
    const c = col(colMap, 'dedup_candidates');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgJsonb');
    expect(c.hasDefault).toBe(true);
  });

  it('submitter_email is nullable', () => {
    expect(col(colMap, 'submitter_email').notNull).toBe(false);
  });

  it('submitter_ip_hash is nullable', () => {
    expect(col(colMap, 'submitter_ip_hash').notNull).toBe(false);
  });

  it('published_at is nullable timestamptz', () => {
    expect(col(colMap, 'published_at').notNull).toBe(false);
    expect(col(colMap, 'published_at').columnType).toBe('PgTimestamp');
  });

  it('created_at and updated_at are not null with defaults', () => {
    expect(col(colMap, 'created_at').notNull).toBe(true);
    expect(col(colMap, 'created_at').hasDefault).toBe(true);
    expect(col(colMap, 'updated_at').notNull).toBe(true);
    expect(col(colMap, 'updated_at').hasDefault).toBe(true);
  });

  it('search_tsv is a generated always column', () => {
    const c = col(colMap, 'search_tsv');
    expect(c.generated).toBeDefined();
    expect(c.generated!.type).toBe('always');
  });

  it('search_tsv generated SQL expression is defined', () => {
    expect(col(colMap, 'search_tsv').generated!.as).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  17. ingestion_runs -- detailed column coverage                     */
/* ------------------------------------------------------------------ */

describe('ingestion_runs -- column details', () => {
  const config = getTableConfig(ingestionRuns);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('id is uuid PK with default', () => {
    const c = col(colMap, 'id');
    expect(c.primary).toBe(true);
    expect(c.columnType).toBe('PgUUID');
    expect(c.hasDefault).toBe(true);
  });

  it('source_id is uuid type', () => {
    expect(col(colMap, 'source_id').columnType).toBe('PgUUID');
  });

  it('started_at is not null with default', () => {
    const c = col(colMap, 'started_at');
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
    expect(c.columnType).toBe('PgTimestamp');
  });

  it('finished_at is nullable timestamptz', () => {
    expect(col(colMap, 'finished_at').notNull).toBe(false);
    expect(col(colMap, 'finished_at').columnType).toBe('PgTimestamp');
  });

  it('triggered_by is not null', () => {
    expect(col(colMap, 'triggered_by').notNull).toBe(true);
  });

  it('triggered_by_email is nullable text', () => {
    expect(col(colMap, 'triggered_by_email').notNull).toBe(false);
    expect(col(colMap, 'triggered_by_email').columnType).toBe('PgText');
  });

  it.each([
    ['items_found', 0],
    ['items_new', 0],
    ['items_updated', 0],
    ['items_errored', 0],
    ['items_dedup_skipped', 0],
  ])('%s is not null integer defaulting to %d', (colName, defaultVal) => {
    const c = col(colMap, colName);
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgInteger');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(defaultVal);
  });

  it('error_log is not null jsonb with default', () => {
    const c = col(colMap, 'error_log');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgJsonb');
    expect(c.hasDefault).toBe(true);
  });

  it('duration_ms is nullable integer', () => {
    expect(col(colMap, 'duration_ms').notNull).toBe(false);
    expect(col(colMap, 'duration_ms').columnType).toBe('PgInteger');
  });

  it('status is not null text defaulting to running', () => {
    const c = col(colMap, 'status');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgText');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe('running');
  });

  it('FK references sources table', () => {
    const sourceFk = config.foreignKeys.find(
      (fk) => getTableName(fk.reference().foreignTable) === 'sources',
    );
    expect(sourceFk).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  18. submission_rate_limits -- detailed column coverage              */
/* ------------------------------------------------------------------ */

describe('submission_rate_limits -- column details', () => {
  const config = getTableConfig(submissionRateLimits);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('count_1h is not null integer with default 0', () => {
    const c = col(colMap, 'count_1h');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgInteger');
    expect(c.hasDefault).toBe(true);
    expect(c.default).toBe(0);
  });

  it('window_started_at is not null timestamptz with default', () => {
    const c = col(colMap, 'window_started_at');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgTimestamp');
    expect(c.hasDefault).toBe(true);
  });

  it('has no indexes', () => {
    expect(config.indexes.length).toBe(0);
  });

  it('has no foreign keys', () => {
    expect(config.foreignKeys.length).toBe(0);
  });

  it('has no check constraints', () => {
    expect(config.checks.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  19. audit_log -- detailed column coverage                          */
/* ------------------------------------------------------------------ */

describe('audit_log -- column details', () => {
  const config = getTableConfig(auditLog);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('id is uuid PK with default', () => {
    const c = col(colMap, 'id');
    expect(c.primary).toBe(true);
    expect(c.columnType).toBe('PgUUID');
    expect(c.hasDefault).toBe(true);
  });

  it('actor_email is not null text', () => {
    expect(col(colMap, 'actor_email').notNull).toBe(true);
    expect(col(colMap, 'actor_email').columnType).toBe('PgText');
  });

  it('action is not null text', () => {
    expect(col(colMap, 'action').notNull).toBe(true);
    expect(col(colMap, 'action').columnType).toBe('PgText');
  });

  it('target_type is not null text', () => {
    expect(col(colMap, 'target_type').notNull).toBe(true);
    expect(col(colMap, 'target_type').columnType).toBe('PgText');
  });

  it('target_id is not null uuid', () => {
    expect(col(colMap, 'target_id').notNull).toBe(true);
    expect(col(colMap, 'target_id').columnType).toBe('PgUUID');
  });

  it('before is nullable jsonb', () => {
    expect(col(colMap, 'before').notNull).toBe(false);
    expect(col(colMap, 'before').columnType).toBe('PgJsonb');
  });

  it('after is nullable jsonb', () => {
    expect(col(colMap, 'after').notNull).toBe(false);
    expect(col(colMap, 'after').columnType).toBe('PgJsonb');
  });

  it('created_at is not null timestamptz with default', () => {
    const c = col(colMap, 'created_at');
    expect(c.notNull).toBe(true);
    expect(c.columnType).toBe('PgTimestamp');
    expect(c.hasDefault).toBe(true);
  });

  it('has no foreign keys', () => {
    expect(config.foreignKeys.length).toBe(0);
  });

  it('has no check constraints', () => {
    expect(config.checks.length).toBe(0);
  });

  it('has exactly 1 index', () => {
    expect(config.indexes.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  20. source_health view -- column selection                         */
/* ------------------------------------------------------------------ */

describe('source_health view -- columns', () => {
  it('view selection includes all 10 expected fields', () => {
    const viewConfig = getViewConfig(sourceHealth);
    const columnNames = Object.keys(viewConfig.selectedFields);
    for (const field of [
      'id',
      'name',
      'slug',
      'is_active',
      'consecutive_failures',
      'runs_30d',
      'ok_30d',
      'error_30d',
      'last_run_at',
      'last_ok_at',
    ]) {
      expect(columnNames).toContain(field);
    }
  });

  it('view has exactly 10 selected fields', () => {
    const viewConfig = getViewConfig(sourceHealth);
    expect(Object.keys(viewConfig.selectedFields).length).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/*  21. sources -- constraint/index counts                             */
/* ------------------------------------------------------------------ */

describe('sources -- constraint/index counts', () => {
  const config = getTableConfig(sources);

  it('has exactly 1 check constraint', () => {
    expect(config.checks.length).toBe(1);
  });

  it('has exactly 1 index', () => {
    expect(config.indexes.length).toBe(1);
  });

  it('has no foreign keys', () => {
    expect(config.foreignKeys.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  22. events -- constraint/FK counts                                 */
/* ------------------------------------------------------------------ */

describe('events -- constraint/FK counts', () => {
  const config = getTableConfig(events);

  it('has exactly 1 check constraint', () => {
    expect(config.checks.length).toBe(1);
  });

  it('has exactly 1 foreign key', () => {
    expect(config.foreignKeys.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  23. Migration SQL -- conditional index WHERE clauses               */
/* ------------------------------------------------------------------ */

describe('Migration SQL -- conditional index WHERE clauses', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../drizzle/0000_clumsy_charles_xavier.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  it('region_starts_published has WHERE status = published', () => {
    expect(migrationSql).toMatch(
      /events_region_starts_published_idx.*WHERE.*status.*=.*'published'/,
    );
  });

  it('category_starts_published has WHERE status = published', () => {
    expect(migrationSql).toMatch(
      /events_category_starts_published_idx.*WHERE.*status.*=.*'published'/,
    );
  });

  it('merged_into index has WHERE merged_into IS NOT NULL', () => {
    expect(migrationSql).toMatch(/events_merged_into_idx.*WHERE.*merged_into.*IS NOT NULL/);
  });

  it('sources_is_active_kind index exists in migration', () => {
    expect(migrationSql).toContain('CREATE INDEX "sources_is_active_kind_idx" ON "sources"');
  });

  it('audit_log_target_idx exists in migration', () => {
    expect(migrationSql).toContain('CREATE INDEX "audit_log_target_idx" ON "audit_log"');
  });

  it('ingestion_runs indexes exist in migration', () => {
    expect(migrationSql).toContain(
      'CREATE INDEX "ingestion_runs_source_started_idx" ON "ingestion_runs"',
    );
    expect(migrationSql).toContain('CREATE INDEX "ingestion_runs_started_idx" ON "ingestion_runs"');
  });
});

/* ------------------------------------------------------------------ */
/*  24. Migration SQL -- source_health view query content              */
/* ------------------------------------------------------------------ */

describe('Migration SQL -- source_health view content', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../drizzle/0000_clumsy_charles_xavier.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  it('view joins sources and ingestion_runs', () => {
    expect(migrationSql).toMatch(/source_health.*from "sources".*left join "ingestion_runs"/i);
  });

  it('view groups by sources.id', () => {
    expect(migrationSql).toMatch(/source_health.*group by "sources"."id"/i);
  });

  it('view selects runs_30d with 30 day filter', () => {
    expect(migrationSql).toMatch(/runs_30d.*30 days/i);
  });

  it('view selects ok_30d filtering on status = ok', () => {
    expect(migrationSql).toMatch(/ok_30d.*status.*=.*'ok'/i);
  });

  it('view selects error_30d filtering on status = error', () => {
    // In the SQL, the filter clause appears before the alias:
    // ... "status" = 'error') as "error_30d"
    expect(migrationSql).toMatch(/status.*=.*'error'.*error_30d/i);
  });
});
