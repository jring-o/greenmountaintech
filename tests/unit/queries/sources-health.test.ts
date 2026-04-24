import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

interface MockHealthRow {
  id?: string;
  name?: string;
  slug?: string;
  kind?: string;
  adapter_type?: string;
  adapter_key?: string;
  url?: string;
  adapter_config?: unknown;
  trust_level?: string;
  is_active?: boolean;
  contact_url?: string | null;
  rate_limit_per_min?: number;
  robots_respect?: boolean;
  last_run_at?: Date | null;
  last_run_status?: string | null;
  consecutive_failures?: number;
  created_at?: Date;
  updated_at?: Date;
  runs_30d?: number;
  ok_30d?: number;
  error_30d?: number;
  last_health_run_at?: Date | null;
  last_ok_at?: Date | null;
}

let mockRows: MockHealthRow[] = [];

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          groupBy: () => ({
            orderBy: () => Promise.resolve(mockRows),
          }),
        }),
        where: () => ({
          orderBy: () => Promise.resolve(mockRows),
        }),
        orderBy: () => Promise.resolve(mockRows),
      }),
    }),
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

import { listSourcesWithHealth } from '@/lib/db/queries/sources';

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  mockRows = [];
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('listSourcesWithHealth', () => {
  it('returns an empty array when no sources exist', async () => {
    mockRows = [];

    const result = await listSourcesWithHealth();

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('returns sources with health aggregation fields', async () => {
    const now = new Date('2026-04-20T10:00:00.000Z');
    mockRows = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Seven Days',
        slug: 'seven-days',
        kind: 'whitelist',
        adapter_type: 'html',
        adapter_key: 'seven-days',
        url: 'https://example.com',
        adapter_config: {},
        trust_level: 'requires_review',
        is_active: true,
        contact_url: null,
        rate_limit_per_min: 10,
        robots_respect: true,
        last_run_at: now,
        last_run_status: 'ok',
        consecutive_failures: 0,
        created_at: now,
        updated_at: now,
        runs_30d: 15,
        ok_30d: 14,
        error_30d: 1,
        last_health_run_at: now,
        last_ok_at: now,
      },
    ];

    const result = await listSourcesWithHealth();

    expect(result).toHaveLength(1);
    expect(result[0]!.runs_30d).toBe(15);
    expect(result[0]!.ok_30d).toBe(14);
    expect(result[0]!.error_30d).toBe(1);
    expect(result[0]!.last_health_run_at).toEqual(now);
    expect(result[0]!.last_ok_at).toEqual(now);
  });

  it('returns zero health counts for a source with no runs', async () => {
    mockRows = [
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'No Runs Source',
        slug: 'no-runs',
        kind: 'admin_added',
        adapter_type: 'ical',
        adapter_key: 'no-runs',
        url: 'https://example.com/ical',
        adapter_config: {},
        trust_level: 'auto_publish',
        is_active: true,
        contact_url: null,
        rate_limit_per_min: 10,
        robots_respect: true,
        last_run_at: null,
        last_run_status: null,
        consecutive_failures: 0,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        updated_at: new Date('2026-04-01T00:00:00.000Z'),
        runs_30d: 0,
        ok_30d: 0,
        error_30d: 0,
        last_health_run_at: null,
        last_ok_at: null,
      },
    ];

    const result = await listSourcesWithHealth();

    expect(result).toHaveLength(1);
    expect(result[0]!.runs_30d).toBe(0);
    expect(result[0]!.ok_30d).toBe(0);
    expect(result[0]!.error_30d).toBe(0);
    expect(result[0]!.last_health_run_at).toBeNull();
    expect(result[0]!.last_ok_at).toBeNull();
  });

  it('returns multiple sources preserving all source fields', async () => {
    const d1 = new Date('2026-04-15T10:00:00.000Z');
    const d2 = new Date('2026-04-18T12:00:00.000Z');

    mockRows = [
      {
        id: 'aaa',
        name: 'Alpha Source',
        slug: 'alpha',
        kind: 'whitelist',
        adapter_type: 'html',
        adapter_key: 'alpha',
        url: 'https://alpha.example.com',
        adapter_config: {},
        trust_level: 'requires_review',
        is_active: true,
        contact_url: null,
        rate_limit_per_min: 10,
        robots_respect: true,
        last_run_at: d1,
        last_run_status: 'ok',
        consecutive_failures: 0,
        created_at: d1,
        updated_at: d1,
        runs_30d: 10,
        ok_30d: 10,
        error_30d: 0,
        last_health_run_at: d1,
        last_ok_at: d1,
      },
      {
        id: 'bbb',
        name: 'Beta Source',
        slug: 'beta',
        kind: 'admin_added',
        adapter_type: 'rss',
        adapter_key: 'beta',
        url: 'https://beta.example.com',
        adapter_config: {},
        trust_level: 'auto_publish',
        is_active: false,
        contact_url: 'https://contact.beta.com',
        rate_limit_per_min: 5,
        robots_respect: false,
        last_run_at: d2,
        last_run_status: 'error',
        consecutive_failures: 4,
        created_at: d2,
        updated_at: d2,
        runs_30d: 8,
        ok_30d: 4,
        error_30d: 4,
        last_health_run_at: d2,
        last_ok_at: d1,
      },
    ];

    const result = await listSourcesWithHealth();

    expect(result).toHaveLength(2);

    // Verify first source
    expect(result[0]!.name).toBe('Alpha Source');
    expect(result[0]!.is_active).toBe(true);
    expect(result[0]!.consecutive_failures).toBe(0);

    // Verify second source
    expect(result[1]!.name).toBe('Beta Source');
    expect(result[1]!.is_active).toBe(false);
    expect(result[1]!.consecutive_failures).toBe(4);
    expect(result[1]!.error_30d).toBe(4);
  });

  it('includes health fields with all errors for a failing source', async () => {
    mockRows = [
      {
        id: 'fail-source',
        name: 'Failing Source',
        slug: 'failing',
        kind: 'whitelist',
        adapter_type: 'html',
        adapter_key: 'failing',
        url: 'https://failing.example.com',
        adapter_config: {},
        trust_level: 'requires_review',
        is_active: true,
        contact_url: null,
        rate_limit_per_min: 10,
        robots_respect: true,
        last_run_at: new Date('2026-04-20T10:00:00.000Z'),
        last_run_status: 'error',
        consecutive_failures: 7,
        created_at: new Date('2026-04-01T00:00:00.000Z'),
        updated_at: new Date('2026-04-20T10:00:00.000Z'),
        runs_30d: 10,
        ok_30d: 0,
        error_30d: 10,
        last_health_run_at: new Date('2026-04-20T10:00:00.000Z'),
        last_ok_at: null,
      },
    ];

    const result = await listSourcesWithHealth();

    expect(result).toHaveLength(1);
    expect(result[0]!.runs_30d).toBe(10);
    expect(result[0]!.ok_30d).toBe(0);
    expect(result[0]!.error_30d).toBe(10);
    expect(result[0]!.last_ok_at).toBeNull();
    expect(result[0]!.consecutive_failures).toBe(7);
  });
});
