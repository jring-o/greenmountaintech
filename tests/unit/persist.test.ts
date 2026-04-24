import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@/lib/adapters/types';
import type { SourceRow } from '@/lib/db/schema';
import type { EventRowCandidate } from '@/lib/ingest/normalize';
import { persistEvent } from '@/lib/ingest/persist';
import type { PersistContext } from '@/lib/ingest/persist';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Source',
    slug: 'test-source',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    url: 'https://example.com/cal.ics',
    adapter_config: {},
    trust_level: 'auto_publish',
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeCandidate(overrides: Partial<EventRowCandidate> = {}): EventRowCandidate {
  return {
    source_id: '00000000-0000-0000-0000-000000000001',
    external_id: 'ext-1',
    title: 'Vermont Jazz Festival',
    description: 'A great jazz festival',
    description_html: null,
    starts_at_utc: new Date('2025-07-15T18:00:00Z'),
    ends_at_utc: new Date('2025-07-15T22:00:00Z'),
    tzid: 'America/New_York',
    all_day: false,
    venue_name: 'Burlington Town Center',
    venue_address: null,
    region: 'statewide',
    lat: null,
    lng: null,
    url: 'https://example.com/event',
    image_url: null,
    category: 'music',
    tags: ['jazz'],
    dedupe_key: 'vermont-jazz-festival|2025-07-15|burlington-town-center',
    ...overrides,
  };
}

function fakeLog(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => fakeLog(),
  };
}

/**
 * Create a mock DB context with a fake transaction that tracks queries.
 *
 * The `selectResults` map lets each test pre-configure what the
 * tx.select().from(events).where(...) calls return.
 */
function createMockCtx(
  options: {
    externalIdMatch?: Record<string, unknown>[];
    dedupeKeyMatch?: Record<string, unknown>[];
  } = {},
): {
  ctx: PersistContext;
  insertedValues: Record<string, unknown>[];
  updatedValues: { set: Record<string, unknown>; whereId: string }[];
} {
  const insertedValues: Record<string, unknown>[] = [];
  const updatedValues: { set: Record<string, unknown>; whereId: string }[] = [];

  let selectCallIndex = 0;
  const selectResults = [options.externalIdMatch ?? [], options.dedupeKeyMatch ?? []];

  const fakeTx = {
    select: () => {
      const currentIndex = selectCallIndex;
      selectCallIndex++;
      return {
        from: () => ({
          where: () => {
            const data = selectResults[currentIndex] ?? [];
            // Return an array-like object that also has .limit() for the first query
            const result = [...data] as Record<string, unknown>[] & {
              limit: (n: number) => Record<string, unknown>[];
            };
            result.limit = () => data;
            return result;
          },
        }),
      };
    },
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertedValues.push(vals);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (setVals: Record<string, unknown>) => ({
        where: (whereClause: unknown) => {
          // Extract id from the eq() call -- we store the raw clause
          updatedValues.push({ set: setVals, whereId: String(whereClause) });
          return Promise.resolve();
        },
      }),
    }),
  };

  const db = {
    transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
      return fn(fakeTx);
    },
  };

  const ctx: PersistContext = {
    db: db as unknown as PersistContext['db'],
    log: fakeLog(),
    now: () => new Date('2025-07-01T12:00:00Z'),
  };

  return { ctx, insertedValues, updatedValues };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('persistEvent', () => {
  // ---- Trust routing: whitelist + auto_publish -> published ----

  it('inserts with status=published and published_at for auto_publish whitelist source', async () => {
    const source = fakeSource({
      kind: 'whitelist',
      trust_level: 'auto_publish',
    });
    const candidate = fakeCandidate({ source_id: source.id });
    const { ctx, insertedValues } = createMockCtx();

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.status).toBe('published');
    expect(insertedValues[0]!.published_at).toEqual(new Date('2025-07-01T12:00:00Z'));
  });

  it('inserts with status=pending_review for review trust level', async () => {
    const source = fakeSource({
      kind: 'whitelist',
      trust_level: 'review',
    });
    const candidate = fakeCandidate({ source_id: source.id });
    const { ctx, insertedValues } = createMockCtx();

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.status).toBe('pending_review');
    expect(insertedValues[0]!.published_at).toBeNull();
  });

  it('inserts with status=published for admin_added + auto_publish', async () => {
    const source = fakeSource({
      kind: 'admin_added',
      trust_level: 'auto_publish',
    });
    const candidate = fakeCandidate({ source_id: source.id });
    const { ctx, insertedValues } = createMockCtx();

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues[0]!.status).toBe('published');
  });

  it('inserts with status=pending_review for admin_added + review', async () => {
    const source = fakeSource({
      kind: 'admin_added',
      trust_level: 'review',
    });
    const candidate = fakeCandidate({ source_id: source.id });
    const { ctx, insertedValues } = createMockCtx();

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues[0]!.status).toBe('pending_review');
  });

  // ---- Re-ingest: same (source_id, external_id) -> update ----

  it('updates mutable fields and preserves status/published_at on re-ingest', async () => {
    const source = fakeSource();
    const candidate = fakeCandidate({ source_id: source.id });

    const existingRow = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      source_id: source.id,
      external_id: 'ext-1',
      status: 'published',
      published_at: new Date('2025-06-01T00:00:00Z'),
      merged_into: null,
    };

    const { ctx, updatedValues } = createMockCtx({
      externalIdMatch: [existingRow],
    });

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('updated');
    expect(updatedValues).toHaveLength(1);
    // Status and published_at should NOT be in the update set
    expect(updatedValues[0]!.set).not.toHaveProperty('status');
    expect(updatedValues[0]!.set).not.toHaveProperty('published_at');
    // But title etc should be updated
    expect(updatedValues[0]!.set).toHaveProperty('title');
    expect(updatedValues[0]!.set).toHaveProperty('dedupe_key');
  });

  // ---- Re-ingest: rejected -> dedup_skipped ----

  it('returns dedup_skipped when existing event is rejected', async () => {
    const source = fakeSource();
    const candidate = fakeCandidate({ source_id: source.id });

    const rejectedRow = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      source_id: source.id,
      external_id: 'ext-1',
      status: 'rejected',
      published_at: null,
      merged_into: null,
    };

    const { ctx, insertedValues, updatedValues } = createMockCtx({
      externalIdMatch: [rejectedRow],
    });

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('dedup_skipped');
    expect(insertedValues).toHaveLength(0);
    expect(updatedValues).toHaveLength(0);
  });

  // ---- Exact dedupe_key match: two sources, same key -> duplicate ----

  it('inserts as duplicate when dedupe_key matches event from different source', async () => {
    const source = fakeSource({
      id: '00000000-0000-0000-0000-000000000002',
    });
    const candidate = fakeCandidate({
      source_id: source.id,
      dedupe_key: 'vermont-jazz-festival|2025-07-15|burlington-town-center',
    });

    const existingFromOtherSource = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      source_id: '00000000-0000-0000-0000-000000000001', // different source
      external_id: 'other-ext',
      status: 'published',
      published_at: new Date('2025-06-01T00:00:00Z'),
      dedupe_key: 'vermont-jazz-festival|2025-07-15|burlington-town-center',
      merged_into: null,
    };

    const { ctx, insertedValues } = createMockCtx({
      dedupeKeyMatch: [existingFromOtherSource],
    });

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('duplicate');
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.status).toBe('duplicate');
    expect(insertedValues[0]!.merged_into).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  // ---- Re-ingest of duplicate event -> update canonical ----

  it('updates canonical event when re-ingesting a duplicate', async () => {
    const source = fakeSource();
    const candidate = fakeCandidate({ source_id: source.id });

    const duplicateRow = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      source_id: source.id,
      external_id: 'ext-1',
      status: 'duplicate',
      published_at: null,
      merged_into: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    };

    const { ctx, updatedValues } = createMockCtx({
      externalIdMatch: [duplicateRow],
    });

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('updated');
    expect(updatedValues).toHaveLength(1);
  });

  // ---- Insert when no match ----

  it('inserts new event when no external_id or dedupe_key match', async () => {
    const source = fakeSource({ trust_level: 'review' });
    const candidate = fakeCandidate({ source_id: source.id });
    const { ctx, insertedValues } = createMockCtx();

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.source_id).toBe(source.id);
    expect(insertedValues[0]!.external_id).toBe('ext-1');
  });

  // ---- Dedupe key match from same source (not cross-source) -> insert normally ----

  it('does not mark as duplicate when dedupe_key matches from same source', async () => {
    const source = fakeSource({ trust_level: 'review' });
    const candidate = fakeCandidate({ source_id: source.id });

    const sameSourceMatch = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      source_id: source.id, // same source
      external_id: 'other-ext',
      status: 'published',
      dedupe_key: 'vermont-jazz-festival|2025-07-15|burlington-town-center',
      merged_into: null,
    };

    const { ctx, insertedValues } = createMockCtx({
      dedupeKeyMatch: [sameSourceMatch],
    });

    const result = await persistEvent(candidate, source, ctx);

    expect(result).toBe('inserted');
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.status).toBe('pending_review');
  });

  // ---- Transaction wrapping ----

  it('wraps all operations in a transaction', async () => {
    const source = fakeSource();
    const candidate = fakeCandidate({ source_id: source.id });

    let transactionCalled = false;
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        transactionCalled = true;
        const fakeTx = {
          select: () => ({
            from: () => ({
              where: () => {
                const arr: Record<string, unknown>[] = [];
                (arr as unknown as Record<string, (...args: unknown[]) => unknown>).limit = () =>
                  [] as Record<string, unknown>[];
                return arr;
              },
            }),
          }),
          insert: () => ({
            values: () => Promise.resolve(),
          }),
        };
        return fn(fakeTx);
      },
    };

    const ctx: PersistContext = {
      db: db as unknown as PersistContext['db'],
      log: fakeLog(),
      now: () => new Date('2025-07-01T12:00:00Z'),
    };

    await persistEvent(candidate, source, ctx);
    expect(transactionCalled).toBe(true);
  });
});
