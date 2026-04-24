import { describe, expect, it, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

interface MockQueryResult {
  value?: number;
  status?: string;
  started_at?: Date;
}

let selectCallIndex = 0;
const selectResults: MockQueryResult[][] = [];

function makeChain(idx: number) {
  return {
    from: () => makeChain(idx),
    where: () => makeChain(idx),
    orderBy: () => makeChain(idx),
    limit: () => {
      return Promise.resolve(selectResults[idx] ?? []);
    },
    then: (resolve: (val: MockQueryResult[]) => void) => {
      resolve(selectResults[idx] ?? []);
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => {
      const idx = selectCallIndex++;
      return makeChain(idx);
    },
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://localhost/test',
    DATABASE_URL_UNPOOLED: 'postgresql://localhost/test',
    CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
    CLERK_SECRET_KEY: 'sk_test_mock',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
    ADMIN_EMAILS: ['admin@example.com'],
    CRON_SECRET: 'mock-secret',
    USER_AGENT_CONTACT: 'mock@example.com',
    SUBMISSION_IP_SALT: 'mock-salt',
  },
}));

/* ------------------------------------------------------------------ */
/*  Import module under test                                           */
/* ------------------------------------------------------------------ */

import { getDashboardSummary } from '@/lib/db/queries/dashboard';

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  selectCallIndex = 0;
  selectResults.length = 0;
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('getDashboardSummary', () => {
  it('returns all four counts when data is present', async () => {
    const cronDate = new Date('2026-04-20T10:00:00.000Z');

    // Query order: pending, published7d, activeSources, lastCron
    selectResults.push(
      [{ value: 5 }], // pendingReviewCount
      [{ value: 12 }], // publishedLast7DaysCount
      [{ value: 3 }], // sourcesActiveCount
      [{ status: 'ok', started_at: cronDate }], // lastCronStatus
    );

    const result = await getDashboardSummary();

    expect(result.pendingReviewCount).toBe(5);
    expect(result.publishedLast7DaysCount).toBe(12);
    expect(result.sourcesActiveCount).toBe(3);
    expect(result.lastCronStatus).toEqual({
      status: 'ok',
      started_at: cronDate,
    });
  });

  it('returns zero counts when no data exists', async () => {
    // All queries return empty
    selectResults.push(
      [{ value: 0 }], // pendingReviewCount
      [{ value: 0 }], // publishedLast7DaysCount
      [{ value: 0 }], // sourcesActiveCount
      [], // lastCronStatus (no runs)
    );

    const result = await getDashboardSummary();

    expect(result.pendingReviewCount).toBe(0);
    expect(result.publishedLast7DaysCount).toBe(0);
    expect(result.sourcesActiveCount).toBe(0);
    expect(result.lastCronStatus).toBeNull();
  });

  it('handles lastCronStatus with error status', async () => {
    const cronDate = new Date('2026-04-19T08:00:00.000Z');

    selectResults.push(
      [{ value: 2 }],
      [{ value: 7 }],
      [{ value: 1 }],
      [{ status: 'error', started_at: cronDate }],
    );

    const result = await getDashboardSummary();

    expect(result.pendingReviewCount).toBe(2);
    expect(result.publishedLast7DaysCount).toBe(7);
    expect(result.sourcesActiveCount).toBe(1);
    expect(result.lastCronStatus).toEqual({
      status: 'error',
      started_at: cronDate,
    });
  });

  it('validates all count fields are non-negative', async () => {
    const cronDate = new Date('2026-04-20T10:00:00.000Z');

    selectResults.push(
      [{ value: 10 }],
      [{ value: 25 }],
      [{ value: 4 }],
      [{ status: 'ok', started_at: cronDate }],
    );

    const result = await getDashboardSummary();

    expect(result.pendingReviewCount).toBeGreaterThanOrEqual(0);
    expect(result.publishedLast7DaysCount).toBeGreaterThanOrEqual(0);
    expect(result.sourcesActiveCount).toBeGreaterThanOrEqual(0);
  });

  it('falls back to 0 when count result is undefined', async () => {
    // Simulate unexpected empty result arrays
    selectResults.push(
      [], // empty - no value
      [], // empty - no value
      [], // empty - no value
      [], // empty - no cron
    );

    const result = await getDashboardSummary();

    expect(result.pendingReviewCount).toBe(0);
    expect(result.publishedLast7DaysCount).toBe(0);
    expect(result.sourcesActiveCount).toBe(0);
    expect(result.lastCronStatus).toBeNull();
  });
});
