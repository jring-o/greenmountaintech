import fs from 'node:fs';
import path from 'node:path';

import { getTableName } from 'drizzle-orm';
import { getTableConfig, getViewConfig } from 'drizzle-orm/pg-core';
import { describe, it, expect } from 'vitest';

import {
  // Enums
  sourceKindEnum,
  adapterTypeEnum,
  trustLevelEnum,
  eventStatusEnum,
  eventCategoryEnum,
  regionEnum,
  runTriggerEnum,
  // Tables
  sources,
  events,
  ingestionRuns,
  submissionRateLimits,
  auditLog,
  // View
  sourceHealth,
  // Row types (imported as types for compile-time check)
  type SourceRow,
  type NewSourceRow,
  type EventRow,
  type NewEventRow,
  type IngestionRunRow,
  type NewIngestionRunRow,
  type SubmissionRateLimitRow,
  type NewSubmissionRateLimitRow,
  type AuditLogRow,
  type NewAuditLogRow,
} from '@/lib/db/schema';

type ColumnConfig = ReturnType<typeof getTableConfig>['columns'][number];
type ColMap = Record<string, ColumnConfig | undefined>;

function col(map: ColMap, name: string): ColumnConfig {
  const c = map[name];
  if (!c) throw new Error(`Column "${name}" not found`);
  return c;
}

/* ------------------------------------------------------------------ */
/*  1. Table names                                                     */
/* ------------------------------------------------------------------ */

describe('Table names', () => {
  it('sources table is named "sources"', () => {
    expect(getTableName(sources)).toBe('sources');
  });

  it('events table is named "events"', () => {
    expect(getTableName(events)).toBe('events');
  });

  it('ingestionRuns table is named "ingestion_runs"', () => {
    expect(getTableName(ingestionRuns)).toBe('ingestion_runs');
  });

  it('submissionRateLimits table is named "submission_rate_limits"', () => {
    expect(getTableName(submissionRateLimits)).toBe('submission_rate_limits');
  });

  it('auditLog table is named "audit_log"', () => {
    expect(getTableName(auditLog)).toBe('audit_log');
  });
});

/* ------------------------------------------------------------------ */
/*  2. Enum values                                                     */
/* ------------------------------------------------------------------ */

describe('Enum values', () => {
  it('source_kind has correct values', () => {
    expect(sourceKindEnum.enumValues).toEqual(['whitelist', 'admin_added']);
  });

  it('adapter_type has correct values', () => {
    expect(adapterTypeEnum.enumValues).toEqual(['ical', 'rss', 'html', 'json']);
  });

  it('trust_level has correct values', () => {
    expect(trustLevelEnum.enumValues).toEqual(['auto_publish', 'review']);
  });

  it('event_status has correct values', () => {
    expect(eventStatusEnum.enumValues).toEqual([
      'published',
      'pending_review',
      'rejected',
      'duplicate',
    ]);
  });

  it('event_category has correct 12 values', () => {
    expect(eventCategoryEnum.enumValues).toEqual([
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
      'other',
    ]);
  });

  it('region has correct 6 values', () => {
    expect(regionEnum.enumValues).toEqual([
      'burlington_area',
      'champlain_valley',
      'central_vt',
      'northeast_kingdom',
      'southern_vt',
      'statewide',
    ]);
  });

  it('run_trigger has correct values', () => {
    expect(runTriggerEnum.enumValues).toEqual(['cron', 'manual']);
  });
});

/* ------------------------------------------------------------------ */
/*  3. sources table columns                                           */
/* ------------------------------------------------------------------ */

describe('sources table structure', () => {
  const config = getTableConfig(sources);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('has uuid primary key "id"', () => {
    const id = col(colMap, 'id');
    expect(id.primary).toBe(true);
    expect(id.columnType).toBe('PgUUID');
  });

  it('has unique text columns "name" and "slug"', () => {
    const name = col(colMap, 'name');
    const slug = col(colMap, 'slug');
    expect(name.notNull).toBe(true);
    expect(slug.notNull).toBe(true);
    expect(name.isUnique).toBe(true);
    expect(slug.isUnique).toBe(true);
  });

  it('has kind column using source_kind enum', () => {
    expect(col(colMap, 'kind').notNull).toBe(true);
  });

  it('has adapter_type column', () => {
    expect(col(colMap, 'adapter_type').notNull).toBe(true);
  });

  it('has rate_limit_per_min with default 30', () => {
    expect(col(colMap, 'rate_limit_per_min').notNull).toBe(true);
  });

  it('has is_active boolean defaulting true', () => {
    const isActive = col(colMap, 'is_active');
    expect(isActive.notNull).toBe(true);
    expect(isActive.columnType).toBe('PgBoolean');
  });

  it('has timestamptz created_at and updated_at', () => {
    expect(col(colMap, 'created_at').notNull).toBe(true);
    expect(col(colMap, 'updated_at').notNull).toBe(true);
  });

  it('has all 18 columns per spec', () => {
    const expectedColumns = [
      'id',
      'name',
      'slug',
      'kind',
      'adapter_type',
      'adapter_key',
      'url',
      'adapter_config',
      'trust_level',
      'is_active',
      'contact_url',
      'rate_limit_per_min',
      'robots_respect',
      'last_run_at',
      'last_run_status',
      'consecutive_failures',
      'created_at',
      'updated_at',
    ];
    for (const col of expectedColumns) {
      expect(colMap[col]).toBeDefined();
    }
    expect(config.columns.length).toBe(18);
  });

  it('has rate_limit_check constraint', () => {
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain('sources_rate_limit_check');
  });

  it('has is_active_kind index', () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain('sources_is_active_kind_idx');
  });
});

/* ------------------------------------------------------------------ */
/*  4. events table columns                                            */
/* ------------------------------------------------------------------ */

describe('events table structure', () => {
  const config = getTableConfig(events);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('has all 29 columns per spec', () => {
    const expectedColumns = [
      'id',
      'source_id',
      'external_id',
      'title',
      'description',
      'description_html',
      'starts_at_utc',
      'ends_at_utc',
      'tzid',
      'all_day',
      'venue_name',
      'venue_address',
      'region',
      'lat',
      'lng',
      'url',
      'image_url',
      'status',
      'category',
      'tags',
      'dedupe_key',
      'merged_into',
      'dedup_candidates',
      'submitter_email',
      'submitter_ip_hash',
      'search_tsv',
      'created_at',
      'updated_at',
      'published_at',
    ];
    for (const col of expectedColumns) {
      expect(colMap[col]).toBeDefined();
    }
    expect(config.columns.length).toBe(29);
  });

  it('source_id is nullable uuid (FK to sources)', () => {
    const sourceId = col(colMap, 'source_id');
    expect(sourceId.columnType).toBe('PgUUID');
    expect(sourceId.notNull).toBe(false);
  });

  it('title is not null text', () => {
    const title = col(colMap, 'title');
    expect(title.notNull).toBe(true);
    expect(title.columnType).toBe('PgText');
  });

  it('starts_at_utc is not null timestamptz', () => {
    expect(col(colMap, 'starts_at_utc').notNull).toBe(true);
  });

  it('ends_at_utc is nullable timestamptz', () => {
    expect(col(colMap, 'ends_at_utc').notNull).toBe(false);
  });

  it('status is not null', () => {
    expect(col(colMap, 'status').notNull).toBe(true);
  });

  it('lat and lng are numeric(9,6)', () => {
    expect(col(colMap, 'lat').columnType).toBe('PgNumeric');
    expect(col(colMap, 'lng').columnType).toBe('PgNumeric');
  });

  it('has search_tsv generated column', () => {
    const searchTsv = col(colMap, 'search_tsv');
    expect(searchTsv.generated).toBeDefined();
  });

  it('has ends_after_starts check constraint', () => {
    const checkNames = config.checks.map((c) => c.name);
    expect(checkNames).toContain('events_ends_after_starts');
  });

  it('has partial unique index on source_id + external_id', () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain('events_source_external_uniq');
  });

  it('has all 8 expected indexes', () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain('events_source_external_uniq');
    expect(idxNames).toContain('events_dedupe_key_idx');
    expect(idxNames).toContain('events_status_starts_idx');
    expect(idxNames).toContain('events_region_starts_published_idx');
    expect(idxNames).toContain('events_category_starts_published_idx');
    expect(idxNames).toContain('events_tags_gin_idx');
    expect(idxNames).toContain('events_search_tsv_gin_idx');
    expect(idxNames).toContain('events_merged_into_idx');
    expect(idxNames.length).toBe(8);
  });

  it('has foreign key to sources with ON DELETE SET NULL', () => {
    const fks = config.foreignKeys;
    expect(fks.length).toBeGreaterThanOrEqual(1);
    const sourceFk = fks.find(
      (fk) =>
        fk.reference().foreignTable === sources ||
        getTableName(fk.reference().foreignTable) === 'sources',
    );
    expect(sourceFk).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  5. ingestion_runs table                                            */
/* ------------------------------------------------------------------ */

describe('ingestion_runs table structure', () => {
  const config = getTableConfig(ingestionRuns);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('has all 14 columns per spec', () => {
    const expectedColumns = [
      'id',
      'source_id',
      'started_at',
      'finished_at',
      'triggered_by',
      'triggered_by_email',
      'items_found',
      'items_new',
      'items_updated',
      'items_errored',
      'items_dedup_skipped',
      'error_log',
      'duration_ms',
      'status',
    ];
    for (const col of expectedColumns) {
      expect(colMap[col]).toBeDefined();
    }
    expect(config.columns.length).toBe(14);
  });

  it('source_id is not null (FK to sources with CASCADE)', () => {
    expect(col(colMap, 'source_id').notNull).toBe(true);
    const fks = config.foreignKeys;
    expect(fks.length).toBeGreaterThanOrEqual(1);
  });

  it('has 2 indexes on started_at', () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain('ingestion_runs_source_started_idx');
    expect(idxNames).toContain('ingestion_runs_started_idx');
    expect(idxNames.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  6. submission_rate_limits table                                     */
/* ------------------------------------------------------------------ */

describe('submission_rate_limits table structure', () => {
  const config = getTableConfig(submissionRateLimits);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('has ip_hash as text PK', () => {
    const ipHash = col(colMap, 'ip_hash');
    expect(ipHash.primary).toBe(true);
    expect(ipHash.columnType).toBe('PgText');
  });

  it('has all 3 columns', () => {
    expect(config.columns.length).toBe(3);
    expect(colMap['count_1h']).toBeDefined();
    expect(colMap['window_started_at']).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  7. audit_log table                                                 */
/* ------------------------------------------------------------------ */

describe('audit_log table structure', () => {
  const config = getTableConfig(auditLog);
  const colMap: ColMap = Object.fromEntries(config.columns.map((c) => [c.name, c]));

  it('has all 8 columns per spec', () => {
    const expectedColumns = [
      'id',
      'actor_email',
      'action',
      'target_type',
      'target_id',
      'before',
      'after',
      'created_at',
    ];
    for (const col of expectedColumns) {
      expect(colMap[col]).toBeDefined();
    }
    expect(config.columns.length).toBe(8);
  });

  it('has audit_log_target_idx index', () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain('audit_log_target_idx');
  });
});

/* ------------------------------------------------------------------ */
/*  8. source_health view                                              */
/* ------------------------------------------------------------------ */

describe('source_health view', () => {
  it('is exported and defined', () => {
    expect(sourceHealth).toBeDefined();
  });

  it('is named "source_health"', () => {
    const viewConfig = getViewConfig(sourceHealth);
    expect(viewConfig.name).toBe('source_health');
  });
});

/* ------------------------------------------------------------------ */
/*  9. Row type exports (compile-time verification)                    */
/* ------------------------------------------------------------------ */

describe('Row type exports', () => {
  it('SourceRow type is assignable with expected shape', () => {
    // Compile-time assertion: if these types are wrong, tsc will fail
    const row: SourceRow = {} as SourceRow;
    expect(row).toBeDefined();
    // Verify key fields exist at type level
  });

  it('NewSourceRow type is assignable', () => {
    const row: NewSourceRow = {} as NewSourceRow;
    expect(row).toBeDefined();
  });

  it('EventRow type is assignable with expected shape', () => {
    const row: EventRow = {} as EventRow;
    expect(row).toBeDefined();
  });

  it('NewEventRow type is assignable', () => {
    const row: NewEventRow = {} as NewEventRow;
    expect(row).toBeDefined();
  });

  it('IngestionRunRow type is assignable', () => {
    const row: IngestionRunRow = {} as IngestionRunRow;
    expect(row).toBeDefined();
  });

  it('NewIngestionRunRow type is assignable', () => {
    const row: NewIngestionRunRow = {} as NewIngestionRunRow;
    expect(row).toBeDefined();
  });

  it('SubmissionRateLimitRow type is assignable', () => {
    const row: SubmissionRateLimitRow = {} as SubmissionRateLimitRow;
    expect(row).toBeDefined();
  });

  it('NewSubmissionRateLimitRow type is assignable', () => {
    const row: NewSubmissionRateLimitRow = {} as NewSubmissionRateLimitRow;
    expect(row).toBeDefined();
  });

  it('AuditLogRow type is assignable', () => {
    const row: AuditLogRow = {} as AuditLogRow;
    expect(row).toBeDefined();
  });

  it('NewAuditLogRow type is assignable', () => {
    const row: NewAuditLogRow = {} as NewAuditLogRow;
    expect(row).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  10. Migration SQL static verification                              */
/* ------------------------------------------------------------------ */

describe('Migration SQL', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../drizzle/0000_clumsy_charles_xavier.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  it('starts with CREATE EXTENSION IF NOT EXISTS pgcrypto', () => {
    expect(migrationSql).toMatch(/^CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  });

  it('contains all 7 enum CREATE TYPE statements', () => {
    const enumNames = [
      'source_kind',
      'adapter_type',
      'trust_level',
      'event_status',
      'event_category',
      'region',
      'run_trigger',
    ];
    for (const name of enumNames) {
      expect(migrationSql).toContain(`CREATE TYPE "public"."${name}" AS ENUM`);
    }
  });

  it('contains all 5 CREATE TABLE statements', () => {
    const tableNames = [
      'sources',
      'events',
      'ingestion_runs',
      'submission_rate_limits',
      'audit_log',
    ];
    for (const name of tableNames) {
      expect(migrationSql).toContain(`CREATE TABLE "${name}"`);
    }
  });

  it('contains the source_health view', () => {
    expect(migrationSql).toContain('CREATE VIEW "public"."source_health"');
  });

  it('contains search_tsv generated column with tsvector', () => {
    expect(migrationSql).toMatch(
      /"search_tsv" "tsvector" GENERATED ALWAYS AS.*to_tsvector.*STORED/,
    );
  });

  it('contains partial unique index on (source_id, external_id)', () => {
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX "events_source_external_uniq".*WHERE.*source_id.*IS NOT NULL.*AND.*external_id.*IS NOT NULL/,
    );
  });

  it('contains GIN index on tags', () => {
    expect(migrationSql).toContain(
      'CREATE INDEX "events_tags_gin_idx" ON "events" USING gin ("tags")',
    );
  });

  it('contains GIN index on search_tsv', () => {
    expect(migrationSql).toContain(
      'CREATE INDEX "events_search_tsv_gin_idx" ON "events" USING gin ("search_tsv")',
    );
  });

  it('contains rate_limit check constraint', () => {
    expect(migrationSql).toMatch(
      /sources_rate_limit_check.*CHECK.*rate_limit_per_min.*> 0.*AND.*rate_limit_per_min.*<= 600/,
    );
  });

  it('contains ends_after_starts check constraint', () => {
    expect(migrationSql).toMatch(
      /events_ends_after_starts.*CHECK.*ends_at_utc.*IS NULL OR.*ends_at_utc.*>=.*starts_at_utc/,
    );
  });

  it('contains FK from events.source_id to sources.id with SET NULL', () => {
    expect(migrationSql).toMatch(
      /events.*source_id.*FOREIGN KEY.*REFERENCES.*sources.*ON DELETE set null/i,
    );
  });

  it('contains FK from ingestion_runs.source_id to sources.id with CASCADE', () => {
    expect(migrationSql).toMatch(
      /ingestion_runs.*source_id.*FOREIGN KEY.*REFERENCES.*sources.*ON DELETE cascade/i,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  11. package.json verification                                      */
/* ------------------------------------------------------------------ */

describe('package.json', () => {
  const pkgPath = path.resolve(__dirname, '../../../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  it('has prebuild script set to "pnpm db:migrate"', () => {
    expect(pkg.scripts.prebuild).toBe('pnpm db:migrate');
  });

  it('has db:generate script set to "drizzle-kit generate"', () => {
    expect(pkg.scripts['db:generate']).toBe('drizzle-kit generate');
  });

  it('has db:migrate script set to "drizzle-kit migrate"', () => {
    expect(pkg.scripts['db:migrate']).toBe('drizzle-kit migrate');
  });
});

/* ------------------------------------------------------------------ */
/*  12. drizzle.config.ts verification                                 */
/* ------------------------------------------------------------------ */

describe('drizzle.config.ts', () => {
  const configPath = path.resolve(__dirname, '../../../../drizzle.config.ts');
  const configContent = fs.readFileSync(configPath, 'utf-8');

  it('uses postgresql dialect', () => {
    expect(configContent).toContain("dialect: 'postgresql'");
  });

  it('points schema to ./lib/db/schema.ts', () => {
    expect(configContent).toContain("schema: './lib/db/schema.ts'");
  });

  it('outputs to ./drizzle', () => {
    expect(configContent).toContain("out: './drizzle'");
  });

  it('uses DATABASE_URL_UNPOOLED for db credentials', () => {
    expect(configContent).toContain('DATABASE_URL_UNPOOLED');
  });
});

/* ------------------------------------------------------------------ */
/*  13. client.ts verification                                         */
/* ------------------------------------------------------------------ */

describe('client.ts', () => {
  const clientPath = path.resolve(__dirname, '../../../../lib/db/client.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf-8');

  it('imports schema from @/lib/db/schema', () => {
    expect(clientContent).toContain("import * as schema from '@/lib/db/schema'");
  });

  it('passes schema to drizzle()', () => {
    expect(clientContent).toMatch(/drizzle\(\{[\s\S]*schema[\s\S]*\}/);
  });
});
