import { and, eq, gte, lte, isNull, or, ilike, sql, asc, desc } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { events, sources } from '@/lib/db/schema';

import {
  decodeCursor,
  decodeFtsCursor,
  decodeAdminCursor,
  encodeAdminCursor,
  encodeCursor,
  encodeFtsCursor,
  type AdminEventsQuery,
  type AdminEventItem,
  type AdminEventsPage,
  type PublicEventsQuery,
  type PublicEventItem,
  type PublicEventDetail,
  type PublicEventsPage,
} from './events-schema';

// Re-export everything from the schema module so consumers can import from
// a single path for production use.
export {
  encodeCursor,
  decodeCursor,
  encodeFtsCursor,
  decodeFtsCursor,
  encodeAdminCursor,
  decodeAdminCursor,
  PublicEventsQuerySchema,
  AdminEventsQuerySchema,
  BulkActionSchema,
  type PublicEventsQuery,
  type PublicEventItem,
  type PublicEventsPage,
  type PublicEventDetail,
  type AdminEventsQuery,
  type AdminEventItem,
  type AdminEventsPage,
  type BulkAction,
} from './events-schema';

/* ------------------------------------------------------------------ */
/*  Shared: text-search condition builder                              */
/* ------------------------------------------------------------------ */

function applyTextSearch(q: string | undefined, conditions: SQL[]): boolean {
  const useTsQuery = q !== undefined && q.length >= 3;
  const useIlike = q !== undefined && q.length > 0 && q.length < 3;

  if (useTsQuery) {
    conditions.push(sql`${events.search_tsv} @@ plainto_tsquery('english', ${q})`);
  } else if (useIlike) {
    const pattern = `%${q}%`;
    conditions.push(or(ilike(events.title, pattern), ilike(events.description, pattern))!);
  }

  return useTsQuery;
}

/* ------------------------------------------------------------------ */
/*  Row-to-response mapper                                              */
/* ------------------------------------------------------------------ */

function mapEventRow(row: typeof events.$inferSelect, sourceName: string | null): PublicEventItem {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at_utc.toISOString(),
    endsAt: row.ends_at_utc ? row.ends_at_utc.toISOString() : null,
    tzid: row.tzid,
    allDay: row.all_day,
    venueName: row.venue_name,
    region: row.region,
    category: row.category,
    tags: row.tags,
    url: `/events/${row.id}`,
    sourceName,
    imageUrl: row.image_url,
  };
}

/* ------------------------------------------------------------------ */
/*  listPublicEvents                                                    */
/* ------------------------------------------------------------------ */

export async function listPublicEvents(input: PublicEventsQuery): Promise<PublicEventsPage> {
  const { fromDate, toDate, region, category, q, limit, cursor } = input;

  // Determine search branch before cursor handling — cursor format depends on it
  const useTsQuery = q !== undefined && q.length >= 3;

  // Base conditions: published, not merged
  const conditions: SQL[] = [
    eq(events.status, 'published'),
    isNull(events.merged_into),
    gte(events.starts_at_utc, fromDate),
    lte(events.starts_at_utc, toDate),
  ];

  if (region) {
    conditions.push(eq(events.region, region));
  }

  if (category) {
    conditions.push(eq(events.category, category));
  }

  // Cursor pagination — format depends on search branch
  if (cursor) {
    if (useTsQuery) {
      // FTS cursor: (rank DESC, starts_at_utc ASC, id ASC)
      const cp = decodeFtsCursor(cursor);
      const cursorRank = Number(cp.rank);
      const cursorDate = new Date(cp.starts_at_utc);
      const cursorRankExpr = sql`ts_rank(${events.search_tsv}, plainto_tsquery('english', ${q}))`;
      conditions.push(
        or(
          sql`${cursorRankExpr} < ${cursorRank}`,
          and(
            sql`${cursorRankExpr} = ${cursorRank}`,
            or(
              sql`${events.starts_at_utc} > ${cursorDate}`,
              and(eq(events.starts_at_utc, cursorDate), sql`${events.id} > ${cp.id}`),
            ),
          ),
        )!,
      );
    } else {
      // Standard cursor: (starts_at_utc ASC, id ASC)
      const cursorPayload = decodeCursor(cursor);
      const cursorDate = new Date(cursorPayload.starts_at_utc);
      conditions.push(
        or(
          sql`${events.starts_at_utc} > ${cursorDate}`,
          and(eq(events.starts_at_utc, cursorDate), sql`${events.id} > ${cursorPayload.id}`),
        )!,
      );
    }
  }

  applyTextSearch(q, conditions);

  // Fetch limit + 1 to determine if there is a next page
  const fetchLimit = limit + 1;

  const rankExpr = sql`ts_rank(${events.search_tsv}, plainto_tsquery('english', ${q}))`;

  const orderClauses = useTsQuery
    ? [desc(rankExpr), asc(events.starts_at_utc), asc(events.id)]
    : [asc(events.starts_at_utc), asc(events.id)];

  // When using FTS, select the rank so we can encode it into the cursor
  const selectFields = useTsQuery
    ? { event: events, sourceName: sources.name, rank: rankExpr.as('rank') }
    : { event: events, sourceName: sources.name };

  const rows = await db
    .select(selectFields)
    .from(events)
    .leftJoin(sources, eq(events.source_id, sources.id))
    .where(and(...conditions))
    .orderBy(...orderClauses)
    .limit(fetchLimit);

  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;

  const eventItems = pageRows.map((row) => mapEventRow(row.event, row.sourceName));

  let nextCursor: string | null = null;
  if (hasNext && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1]!;
    if (useTsQuery) {
      const lastRank = (
        lastRow as {
          event: typeof events.$inferSelect;
          sourceName: string | null;
          rank: number;
        }
      ).rank;
      nextCursor = encodeFtsCursor(Number(lastRank), lastRow.event.starts_at_utc, lastRow.event.id);
    } else {
      nextCursor = encodeCursor(lastRow.event.starts_at_utc, lastRow.event.id);
    }
  }

  return { events: eventItems, nextCursor };
}

/* ------------------------------------------------------------------ */
/*  Admin row-to-response mapper                                        */
/* ------------------------------------------------------------------ */

function mapAdminEventRow(
  row: typeof events.$inferSelect,
  sourceName: string | null,
): AdminEventItem {
  // dedup_candidates is jsonb; count its array length
  const dedupArr = Array.isArray(row.dedup_candidates) ? row.dedup_candidates : [];

  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at_utc.toISOString(),
    endsAt: row.ends_at_utc ? row.ends_at_utc.toISOString() : null,
    region: row.region,
    category: row.category,
    status: row.status,
    sourceName,
    submitterEmail: row.submitter_email,
    dedupCandidatesCount: dedupArr.length,
    createdAt: row.created_at.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  listAdminEvents                                                     */
/* ------------------------------------------------------------------ */

export async function listAdminEvents(input: AdminEventsQuery): Promise<AdminEventsPage> {
  const { status, region, category, q, from, to, limit, cursor } = input;

  const conditions: SQL[] = [];

  if (status) {
    conditions.push(eq(events.status, status));
  }

  if (region) {
    conditions.push(eq(events.region, region));
  }

  if (category) {
    conditions.push(eq(events.category, category));
  }

  if (from) {
    conditions.push(gte(events.starts_at_utc, new Date(from)));
  }

  if (to) {
    conditions.push(lte(events.starts_at_utc, new Date(to)));
  }

  // Cursor pagination: (created_at, id) < (cursorDate, cursorId) descending
  if (cursor) {
    const payload = decodeAdminCursor(cursor);
    const cursorDate = new Date(payload.created_at);
    conditions.push(
      or(
        sql`${events.created_at} < ${cursorDate}`,
        and(eq(events.created_at, cursorDate), sql`${events.id} < ${payload.id}`),
      )!,
    );
  }

  applyTextSearch(q, conditions);

  const fetchLimit = limit + 1;

  const rows = await db
    .select({ event: events, sourceName: sources.name })
    .from(events)
    .leftJoin(sources, eq(events.source_id, sources.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.created_at), desc(events.id))
    .limit(fetchLimit);

  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;

  const eventItems = pageRows.map((row) => mapAdminEventRow(row.event, row.sourceName));

  let nextCursor: string | null = null;
  if (hasNext && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1]!;
    nextCursor = encodeAdminCursor(lastRow.event.created_at, lastRow.event.id);
  }

  return { events: eventItems, nextCursor };
}

/* ------------------------------------------------------------------ */
/*  getPublicEventById                                                  */
/* ------------------------------------------------------------------ */

export async function getPublicEventById(id: string): Promise<PublicEventDetail | null> {
  const rows = await db
    .select({
      event: events,
      sourceName: sources.name,
    })
    .from(events)
    .leftJoin(sources, eq(events.source_id, sources.id))
    .where(and(eq(events.id, id), eq(events.status, 'published'), isNull(events.merged_into)))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0]!;
  const base = mapEventRow(row.event, row.sourceName);

  return {
    ...base,
    description: row.event.description,
    descriptionHtml: row.event.description_html,
    venueAddress: row.event.venue_address,
    lat: row.event.lat,
    lng: row.event.lng,
    externalUrl: row.event.url,
    createdAt: row.event.created_at.toISOString(),
    publishedAt: row.event.published_at ? row.event.published_at.toISOString() : null,
  };
}
