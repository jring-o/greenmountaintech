import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { events, ingestionRuns, sources } from '@/lib/db/schema';
import type { IngestionRunRow } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface RunListItem {
  id: string;
  source_id: string;
  source_name: string;
  started_at: string; // ISO-8601
  finished_at: string | null;
  status: string;
  items_found: number;
  items_new: number;
  items_updated: number;
  items_errored: number;
  duration_ms: number | null;
}

export interface RunsPage {
  runs: RunListItem[];
  nextCursor: string | null;
}

export interface RunDetailItem {
  id: string;
  title: string;
  status: string;
  created_at: string; // ISO-8601
}

export interface RunDetail {
  run: IngestionRunRow;
  source: { id: string; name: string; slug: string } | null;
  items: RunDetailItem[];
}

/* ------------------------------------------------------------------ */
/*  Cursor helpers                                                      */
/* ------------------------------------------------------------------ */

interface RunCursorPayload {
  started_at: string; // ISO-8601
  id: string;
}

export function encodeRunCursor(startedAt: Date, id: string): string {
  const payload: RunCursorPayload = {
    started_at: startedAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeRunCursor(cursor: string): RunCursorPayload {
  const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('started_at' in parsed) ||
    !('id' in parsed)
  ) {
    throw new Error('Invalid cursor payload');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.started_at !== 'string' || typeof obj.id !== 'string') {
    throw new Error('Invalid cursor payload types');
  }
  const d = new Date(obj.started_at);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid cursor date');
  }
  return { started_at: obj.started_at, id: obj.id };
}

/* ------------------------------------------------------------------ */
/*  listRuns                                                            */
/* ------------------------------------------------------------------ */

export async function listRuns({
  cursor,
  limit = 25,
}: {
  cursor?: string;
  limit?: number;
} = {}): Promise<RunsPage> {
  const conditions = [];

  // Cursor pagination: (started_at, id) < (cursorDate, cursorId) descending
  if (cursor) {
    const payload = decodeRunCursor(cursor);
    const cursorDate = new Date(payload.started_at);
    conditions.push(
      or(
        sql`${ingestionRuns.started_at} < ${cursorDate}`,
        and(eq(ingestionRuns.started_at, cursorDate), sql`${ingestionRuns.id} < ${payload.id}`),
      )!,
    );
  }

  const fetchLimit = limit + 1;

  const rows = await db
    .select({
      id: ingestionRuns.id,
      source_id: ingestionRuns.source_id,
      source_name: sources.name,
      started_at: ingestionRuns.started_at,
      finished_at: ingestionRuns.finished_at,
      status: ingestionRuns.status,
      items_found: ingestionRuns.items_found,
      items_new: ingestionRuns.items_new,
      items_updated: ingestionRuns.items_updated,
      items_errored: ingestionRuns.items_errored,
      duration_ms: ingestionRuns.duration_ms,
    })
    .from(ingestionRuns)
    .innerJoin(sources, eq(ingestionRuns.source_id, sources.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ingestionRuns.started_at), desc(ingestionRuns.id))
    .limit(fetchLimit);

  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;

  const runItems: RunListItem[] = pageRows.map((row) => ({
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    started_at: row.started_at.toISOString(),
    finished_at: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    items_found: row.items_found,
    items_new: row.items_new,
    items_updated: row.items_updated,
    items_errored: row.items_errored,
    duration_ms: row.duration_ms,
  }));

  let nextCursor: string | null = null;
  if (hasNext && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1]!;
    nextCursor = encodeRunCursor(lastRow.started_at, lastRow.id);
  }

  return { runs: runItems, nextCursor };
}

/* ------------------------------------------------------------------ */
/*  getRunWithItems                                                     */
/* ------------------------------------------------------------------ */

export async function getRunWithItems(runId: string): Promise<RunDetail | null> {
  // Load run row
  const runRows = await db.select().from(ingestionRuns).where(eq(ingestionRuns.id, runId)).limit(1);

  const run = runRows[0];
  if (!run) return null;

  // Load source
  const sourceRows = await db
    .select({
      id: sources.id,
      name: sources.name,
      slug: sources.slug,
    })
    .from(sources)
    .where(eq(sources.id, run.source_id))
    .limit(1);

  const source = sourceRows[0] ?? null;

  // Load items: events created within [started_at, finished_at] for this source
  const finishedAt = run.finished_at ?? new Date();
  const itemRows = await db
    .select({
      id: events.id,
      title: events.title,
      status: events.status,
      created_at: events.created_at,
    })
    .from(events)
    .where(
      and(
        eq(events.source_id, run.source_id),
        gte(events.created_at, run.started_at),
        lte(events.created_at, finishedAt),
      ),
    )
    .orderBy(desc(events.created_at))
    .limit(50);

  const items: RunDetailItem[] = itemRows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    created_at: row.created_at.toISOString(),
  }));

  return { run, source, items };
}
