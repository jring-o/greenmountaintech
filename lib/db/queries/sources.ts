import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { auditLog, ingestionRuns, sources } from '@/lib/db/schema';
import type { SourceRow, NewSourceRow, AuditLogRow } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ListSourcesFilter {
  kind?: 'whitelist' | 'admin_added';
  isActive?: boolean;
}

export interface SourceWithHealth extends SourceRow {
  runs_30d: number;
  ok_30d: number;
  error_30d: number;
  last_health_run_at: Date | null;
  last_ok_at: Date | null;
}

/* ------------------------------------------------------------------ */
/*  listSources                                                        */
/* ------------------------------------------------------------------ */

export async function listSources(filter: ListSourcesFilter = {}): Promise<SourceRow[]> {
  const conditions = [];

  if (filter.kind !== undefined) {
    conditions.push(eq(sources.kind, filter.kind));
  }
  if (filter.isActive !== undefined) {
    conditions.push(eq(sources.is_active, filter.isActive));
  }

  return db
    .select()
    .from(sources)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sources.name);
}

/* ------------------------------------------------------------------ */
/*  listSourcesWithHealth                                               */
/* ------------------------------------------------------------------ */

export async function listSourcesWithHealth(): Promise<SourceWithHealth[]> {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
      kind: sources.kind,
      adapter_type: sources.adapter_type,
      adapter_key: sources.adapter_key,
      url: sources.url,
      adapter_config: sources.adapter_config,
      trust_level: sources.trust_level,
      is_active: sources.is_active,
      contact_url: sources.contact_url,
      rate_limit_per_min: sources.rate_limit_per_min,
      robots_respect: sources.robots_respect,
      last_run_at: sources.last_run_at,
      last_run_status: sources.last_run_status,
      consecutive_failures: sources.consecutive_failures,
      created_at: sources.created_at,
      updated_at: sources.updated_at,
      runs_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days')`.mapWith(
          Number,
        ),
      ok_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days' and ${ingestionRuns.status} = 'ok')`.mapWith(
          Number,
        ),
      error_30d:
        sql<number>`count(${ingestionRuns.id}) filter (where ${ingestionRuns.started_at} > now() - interval '30 days' and ${ingestionRuns.status} = 'error')`.mapWith(
          Number,
        ),
      last_health_run_at: sql<Date | null>`max(${ingestionRuns.started_at})`,
      last_ok_at: sql<Date | null>`max(${ingestionRuns.started_at}) filter (where ${ingestionRuns.status} = 'ok')`,
    })
    .from(sources)
    .leftJoin(ingestionRuns, eq(ingestionRuns.source_id, sources.id))
    .groupBy(sources.id)
    .orderBy(sources.name);

  return rows as SourceWithHealth[];
}

/* ------------------------------------------------------------------ */
/*  getSource                                                          */
/* ------------------------------------------------------------------ */

export async function getSource(id: string): Promise<SourceRow | null> {
  const rows = await db.select().from(sources).where(eq(sources.id, id)).limit(1);

  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  createSource                                                       */
/* ------------------------------------------------------------------ */

export async function createSource(input: NewSourceRow): Promise<SourceRow> {
  const rows = await db.insert(sources).values(input).returning();
  return rows[0]!;
}

/* ------------------------------------------------------------------ */
/*  updateSource                                                       */
/* ------------------------------------------------------------------ */

export async function updateSource(
  id: string,
  patch: Partial<NewSourceRow>,
): Promise<SourceRow | null> {
  const rows = await db
    .update(sources)
    .set({ ...patch, updated_at: sql`now()` })
    .where(eq(sources.id, id))
    .returning();

  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  softDeleteSource                                                   */
/* ------------------------------------------------------------------ */

export async function softDeleteSource(id: string): Promise<SourceRow | null> {
  const rows = await db
    .update(sources)
    .set({ is_active: false, updated_at: sql`now()` })
    .where(eq(sources.id, id))
    .returning();

  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  getAuditLogsForSource                                              */
/* ------------------------------------------------------------------ */

export async function getAuditLogsForSource(sourceId: string, limit = 20): Promise<AuditLogRow[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.target_type, 'source'), eq(auditLog.target_id, sourceId)))
    .orderBy(desc(auditLog.created_at))
    .limit(limit);
}
