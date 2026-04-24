import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { events, sources } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DedupCandidateScore {
  event_id: string;
  score: number;
  reason: string;
}

export interface CandidateEventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  region: string;
  category: string;
  status: string;
}

export interface PendingDuplicateRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  region: string;
  category: string;
  status: string;
  sourceName: string | null;
  createdAt: string;
  candidates: Array<DedupCandidateScore & { event: CandidateEventRow | null }>;
}

export interface AuditDuplicateRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  region: string;
  category: string;
  status: string;
  sourceName: string | null;
  mergedInto: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  fetchCandidateMap                                                   */
/* ------------------------------------------------------------------ */

type EventWithDedup = { dedup_candidates: unknown };

async function fetchCandidateMap(
  rows: { event: EventWithDedup }[],
): Promise<Map<string, CandidateEventRow>> {
  const allIds = new Set<string>();
  for (const row of rows) {
    const candidates = row.event.dedup_candidates as DedupCandidateScore[];
    if (Array.isArray(candidates)) {
      for (const c of candidates) {
        allIds.add(c.event_id);
      }
    }
  }

  const map = new Map<string, CandidateEventRow>();
  if (allIds.size === 0) return map;

  const candidateRows = await db
    .select()
    .from(events)
    .where(inArray(events.id, [...allIds]));

  for (const cr of candidateRows) {
    map.set(cr.id, {
      id: cr.id,
      title: cr.title,
      startsAt: cr.starts_at_utc.toISOString(),
      endsAt: cr.ends_at_utc ? cr.ends_at_utc.toISOString() : null,
      venueName: cr.venue_name,
      region: cr.region,
      category: cr.category,
      status: cr.status,
    });
  }

  return map;
}

/* ------------------------------------------------------------------ */
/*  listDuplicateCandidates                                            */
/* ------------------------------------------------------------------ */

/**
 * Returns events where status='pending_review' AND
 * jsonb_array_length(dedup_candidates) > 0, joined with the candidate
 * event rows for side-by-side display.
 */
export async function listDuplicateCandidates(): Promise<PendingDuplicateRow[]> {
  const rows = await db
    .select({ event: events, sourceName: sources.name })
    .from(events)
    .leftJoin(sources, eq(events.source_id, sources.id))
    .where(
      and(
        eq(events.status, 'pending_review'),
        sql`jsonb_array_length(${events.dedup_candidates}) > 0`,
      ),
    );

  if (rows.length === 0) return [];

  const candidateMap = await fetchCandidateMap(rows);

  return rows.map((row) => {
    const rawCandidates = row.event.dedup_candidates as DedupCandidateScore[];
    const enrichedCandidates = Array.isArray(rawCandidates)
      ? rawCandidates.map((c) => ({
          ...c,
          event: candidateMap.get(c.event_id) ?? null,
        }))
      : [];

    return {
      id: row.event.id,
      title: row.event.title,
      startsAt: row.event.starts_at_utc.toISOString(),
      endsAt: row.event.ends_at_utc ? row.event.ends_at_utc.toISOString() : null,
      venueName: row.event.venue_name,
      region: row.event.region,
      category: row.event.category,
      status: row.event.status,
      sourceName: row.sourceName,
      createdAt: row.event.created_at.toISOString(),
      candidates: enrichedCandidates,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  listAuditDuplicates                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns events where status='duplicate' for audit display.
 */
export async function listAuditDuplicates(): Promise<AuditDuplicateRow[]> {
  const rows = await db
    .select({ event: events, sourceName: sources.name })
    .from(events)
    .leftJoin(sources, eq(events.source_id, sources.id))
    .where(eq(events.status, 'duplicate'));

  return rows.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    startsAt: row.event.starts_at_utc.toISOString(),
    endsAt: row.event.ends_at_utc ? row.event.ends_at_utc.toISOString() : null,
    venueName: row.event.venue_name,
    region: row.event.region,
    category: row.event.category,
    status: row.event.status,
    sourceName: row.sourceName,
    mergedInto: row.event.merged_into,
    createdAt: row.event.created_at.toISOString(),
  }));
}
