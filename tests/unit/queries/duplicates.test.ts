import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let mockSelectFn = vi.fn();

function makeFakeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Open Mic Night',
    description: 'A fun night',
    description_html: null,
    starts_at_utc: new Date('2026-05-01T19:00:00Z'),
    ends_at_utc: null,
    tzid: 'America/New_York',
    all_day: false,
    venue_name: 'Club',
    venue_address: '123 Main St',
    region: 'burlington_area',
    lat: null,
    lng: null,
    url: null,
    image_url: null,
    status: 'pending_review',
    category: 'music',
    tags: [],
    dedupe_key: 'test-key',
    merged_into: null,
    dedup_candidates: [],
    submitter_email: null,
    submitter_ip_hash: null,
    search_tsv: '',
    source_id: null,
    external_id: null,
    created_at: new Date('2026-04-20T12:00:00Z'),
    updated_at: new Date('2026-04-20T12:00:00Z'),
    published_at: null,
    ...overrides,
  };
}

const CANDIDATE_UUID = '550e8400-e29b-41d4-a716-446655440099';
const CANDIDATE_UUID_2 = '550e8400-e29b-41d4-a716-446655440098';
const SOURCE_UUID = '550e8400-e29b-41d4-a716-446655440001';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://localhost/test',
  },
}));

/**
 * We mock the Drizzle `db` to simulate query chains. The duplicates module
 * uses two query patterns:
 *
 * 1. db.select({event, sourceName}).from(events).leftJoin(...).where(...)
 *    Returns rows with { event: EventRow, sourceName: string | null }
 *
 * 2. db.select().from(events).where(inArray(...))
 *    Returns flat EventRow[] for the candidate batch fetch
 *
 * We differentiate these calls based on whether select receives arguments
 * (the first pattern) or not (the second pattern for candidate fetch).
 */

let primaryQueryRows: unknown[] = [];
let candidateFetchRows: unknown[] = [];

vi.mock('@/lib/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelectFn(...args),
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

function resetMocks(primary: unknown[] = [], candidates: unknown[] = []) {
  primaryQueryRows = primary;
  candidateFetchRows = candidates;

  let callCount = 0;

  mockSelectFn = vi.fn().mockImplementation((...args: unknown[]) => {
    callCount++;
    const isPrimaryQuery = args.length > 0 && typeof args[0] === 'object';

    if (isPrimaryQuery || callCount === 1) {
      // Primary query: db.select({ event, sourceName }).from(...).leftJoin(...).where(...)
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(primaryQueryRows),
          }),
        }),
      };
    }

    // Candidate batch fetch: db.select().from(...).where(inArray(...))
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(candidateFetchRows),
      }),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Import module under test                                           */
/* ------------------------------------------------------------------ */

import { listAuditDuplicates, listDuplicateCandidates } from '@/lib/db/queries/duplicates';

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  resetMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Helper: assert array element exists and return it (avoids TS2532). */
function at<T>(arr: T[], index: number): T {
  const el = arr[index];
  if (el === undefined) throw new Error(`Expected element at index ${index}`);
  return el;
}

/* ------------------------------------------------------------------ */
/*  Tests: listDuplicateCandidates                                     */
/* ------------------------------------------------------------------ */

describe('listDuplicateCandidates', () => {
  it('returns empty array when no rows match', async () => {
    resetMocks([], []);
    const result = await listDuplicateCandidates();
    expect(result).toEqual([]);
  });

  it('returns enriched candidates for pending_review rows with dedup_candidates', async () => {
    const candidateEvent = makeFakeEventRow({
      id: CANDIDATE_UUID,
      title: 'Jazz Night',
      status: 'published',
      starts_at_utc: new Date('2026-05-01T20:00:00Z'),
      venue_name: 'Jazz Club',
      region: 'burlington_area',
      category: 'music',
    });

    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        status: 'pending_review',
        dedup_candidates: [
          {
            event_id: CANDIDATE_UUID,
            score: 0.85,
            reason: 'title=0.90 venue=0.80 time=0.70 total=0.850',
          },
        ],
      }),
      sourceName: 'Seven Days',
    };

    resetMocks([primaryRow], [candidateEvent]);

    const result = await listDuplicateCandidates();

    expect(result).toHaveLength(1);
    const row = at(result, 0);
    expect(row.id).toBe(SOURCE_UUID);
    expect(row.title).toBe('Open Mic Night');
    expect(row.status).toBe('pending_review');
    expect(row.sourceName).toBe('Seven Days');
    expect(row.startsAt).toBe('2026-05-01T19:00:00.000Z');
    expect(row.createdAt).toBe('2026-04-20T12:00:00.000Z');

    // Candidates should be enriched with full event data
    expect(row.candidates).toHaveLength(1);
    const c = at(row.candidates, 0);
    expect(c.event_id).toBe(CANDIDATE_UUID);
    expect(c.score).toBe(0.85);
    expect(c.event).not.toBeNull();
    expect(c.event!.title).toBe('Jazz Night');
    expect(c.event!.id).toBe(CANDIDATE_UUID);
  });

  it('sets candidate.event to null when candidate event is not found in batch', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        dedup_candidates: [
          {
            event_id: CANDIDATE_UUID,
            score: 0.85,
            reason: 'title=0.90 venue=0.80 time=0.70 total=0.850',
          },
        ],
      }),
      sourceName: null,
    };

    // Return empty candidate batch -- event referenced by dedup_candidates not found
    resetMocks([primaryRow], []);

    const result = await listDuplicateCandidates();

    expect(result).toHaveLength(1);
    const row2 = at(result, 0);
    expect(row2.candidates).toHaveLength(1);
    expect(at(row2.candidates, 0).event).toBeNull();
  });

  it('handles multiple candidates per event', async () => {
    const candidate1 = makeFakeEventRow({
      id: CANDIDATE_UUID,
      title: 'Jazz Night',
      status: 'published',
    });
    const candidate2 = makeFakeEventRow({
      id: CANDIDATE_UUID_2,
      title: 'Blues Night',
      status: 'published',
    });

    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        dedup_candidates: [
          {
            event_id: CANDIDATE_UUID,
            score: 0.85,
            reason: 'title=0.90 venue=0.80 time=0.70 total=0.850',
          },
          {
            event_id: CANDIDATE_UUID_2,
            score: 0.78,
            reason: 'title=0.70 venue=0.80 time=0.90 total=0.780',
          },
        ],
      }),
      sourceName: 'Seven Days',
    };

    resetMocks([primaryRow], [candidate1, candidate2]);

    const result = await listDuplicateCandidates();

    expect(result).toHaveLength(1);
    const row3 = at(result, 0);
    expect(row3.candidates).toHaveLength(2);
    expect(at(row3.candidates, 0).event!.title).toBe('Jazz Night');
    expect(at(row3.candidates, 1).event!.title).toBe('Blues Night');
  });

  it('handles rows where dedup_candidates is not an array (defensive)', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        dedup_candidates: null,
      }),
      sourceName: null,
    };

    resetMocks([primaryRow], []);

    const result = await listDuplicateCandidates();

    expect(result).toHaveLength(1);
    expect(at(result, 0).candidates).toEqual([]);
  });

  it('maps endsAt correctly when ends_at_utc is present', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        ends_at_utc: new Date('2026-05-01T21:00:00Z'),
        dedup_candidates: [],
      }),
      sourceName: null,
    };

    resetMocks([primaryRow], []);

    const result = await listDuplicateCandidates();

    expect(at(result, 0).endsAt).toBe('2026-05-01T21:00:00.000Z');
  });

  it('maps endsAt to null when ends_at_utc is null', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        ends_at_utc: null,
        dedup_candidates: [],
      }),
      sourceName: null,
    };

    resetMocks([primaryRow], []);

    const result = await listDuplicateCandidates();

    expect(at(result, 0).endsAt).toBeNull();
  });

  it('maps all fields to the PendingDuplicateRow interface correctly', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        title: 'Test Event',
        venue_name: 'Test Venue',
        region: 'statewide',
        category: 'other',
        status: 'pending_review',
        dedup_candidates: [],
      }),
      sourceName: 'Test Source',
    };

    resetMocks([primaryRow], []);

    const result = await listDuplicateCandidates();

    expect(at(result, 0)).toEqual({
      id: SOURCE_UUID,
      title: 'Test Event',
      startsAt: expect.any(String),
      endsAt: null,
      venueName: 'Test Venue',
      region: 'statewide',
      category: 'other',
      status: 'pending_review',
      sourceName: 'Test Source',
      createdAt: expect.any(String),
      candidates: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: listAuditDuplicates                                         */
/* ------------------------------------------------------------------ */

describe('listAuditDuplicates', () => {
  it('returns empty array when no duplicate events exist', async () => {
    resetMocks([], []);
    const result = await listAuditDuplicates();
    expect(result).toEqual([]);
  });

  it('returns audit rows for events with status=duplicate', async () => {
    const mergedTarget = '550e8400-e29b-41d4-a716-446655440010';

    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        status: 'duplicate',
        merged_into: mergedTarget,
        title: 'Merged Event',
      }),
      sourceName: 'VT.com',
    };

    resetMocks([primaryRow], []);

    const result = await listAuditDuplicates();

    expect(result).toHaveLength(1);
    const auditRow = at(result, 0);
    expect(auditRow.id).toBe(SOURCE_UUID);
    expect(auditRow.title).toBe('Merged Event');
    expect(auditRow.status).toBe('duplicate');
    expect(auditRow.mergedInto).toBe(mergedTarget);
    expect(auditRow.sourceName).toBe('VT.com');
    expect(auditRow.startsAt).toBe('2026-05-01T19:00:00.000Z');
    expect(auditRow.createdAt).toBe('2026-04-20T12:00:00.000Z');
  });

  it('returns null for mergedInto when merged_into is null', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        status: 'duplicate',
        merged_into: null,
      }),
      sourceName: null,
    };

    resetMocks([primaryRow], []);

    const result = await listAuditDuplicates();

    const nullRow = at(result, 0);
    expect(nullRow.mergedInto).toBeNull();
    expect(nullRow.sourceName).toBeNull();
  });

  it('maps endsAt correctly when ends_at_utc is present', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        status: 'duplicate',
        ends_at_utc: new Date('2026-05-01T22:00:00Z'),
      }),
      sourceName: null,
    };

    resetMocks([primaryRow], []);

    const result = await listAuditDuplicates();

    expect(at(result, 0).endsAt).toBe('2026-05-01T22:00:00.000Z');
  });

  it('maps all fields to the AuditDuplicateRow interface correctly', async () => {
    const primaryRow = {
      event: makeFakeEventRow({
        id: SOURCE_UUID,
        title: 'Audit Event',
        status: 'duplicate',
        merged_into: 'target-uuid',
        venue_name: 'Venue',
        region: 'statewide',
        category: 'other',
      }),
      sourceName: 'Source Name',
    };

    resetMocks([primaryRow], []);

    const result = await listAuditDuplicates();

    expect(at(result, 0)).toEqual({
      id: SOURCE_UUID,
      title: 'Audit Event',
      startsAt: expect.any(String),
      endsAt: null,
      venueName: 'Venue',
      region: 'statewide',
      category: 'other',
      status: 'duplicate',
      sourceName: 'Source Name',
      mergedInto: 'target-uuid',
      createdAt: expect.any(String),
    });
  });

  it('handles multiple audit rows', async () => {
    const row1 = {
      event: makeFakeEventRow({
        id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'duplicate',
        title: 'Event A',
      }),
      sourceName: null,
    };

    const row2 = {
      event: makeFakeEventRow({
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'duplicate',
        title: 'Event B',
      }),
      sourceName: 'Source B',
    };

    resetMocks([row1, row2], []);

    const result = await listAuditDuplicates();

    expect(result).toHaveLength(2);
    expect(at(result, 0).title).toBe('Event A');
    expect(at(result, 1).title).toBe('Event B');
  });
});
