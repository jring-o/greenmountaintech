import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

/** Local mirror of RunSummary to avoid cross-group import lint noise. */
type RunSummary = {
  sourceId: string;
  runId: string;
  status: 'ok' | 'partial' | 'error';
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsErrored: number;
  itemsDedupSkipped: number;
  durationMs: number;
};

let adminAuthorised = true;
let adminEmail = 'admin@example.com';
let dbSourceRows: Record<string, unknown>[] = [];
let auditLogInserts: Record<string, unknown>[] = [];
let mockRunOneFn = vi.fn<(...args: unknown[]) => Promise<RunSummary>>();
let revalidatedTags: string[] = [];

/* ------------------------------------------------------------------ */
/*  Mocks (hoisted by vi.mock)                                         */
/* ------------------------------------------------------------------ */

class NotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError();
  },
}));

vi.mock('@/lib/auth/clerk', () => ({
  requireAdmin: async () => {
    if (!adminAuthorised) {
      throw new NotFoundError();
    }
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({
    userId: adminAuthorised ? 'user_123' : null,
    sessionClaims: adminAuthorised ? { email: adminEmail } : {},
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    ADMIN_EMAILS: ['admin@example.com'],
  },
}));

vi.mock('@/lib/log', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/db/client', () => {
  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => dbSourceRows,
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        auditLogInserts.push(vals);
        return { returning: () => [{ id: 'audit-1' }] };
      },
    }),
  };
  return { db: mockDb };
});

vi.mock('@/lib/ingest/runner', () => ({
  runOne: (...args: unknown[]) => mockRunOneFn(...args),
}));

vi.mock('next/cache', () => ({
  revalidateTag: (tag: string) => {
    revalidatedTags.push(tag);
  },
}));

/* ------------------------------------------------------------------ */
/*  Import the route handler under test                                */
/* ------------------------------------------------------------------ */

import { POST } from '@/app/api/admin/sources/[id]/run/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_SOURCE_ROW = {
  id: VALID_UUID,
  name: 'Test Source',
  slug: 'test-source',
  kind: 'whitelist',
  adapter_type: 'ical',
  adapter_key: 'test',
  url: 'https://example.com/feed',
  adapter_config: {},
  trust_level: 'auto_publish',
  is_active: true,
  contact_url: null,
  rate_limit_per_min: 30,
  robots_respect: false,
  last_run_at: null,
  last_run_status: null,
  consecutive_failures: 0,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
};

function makeRequest(): Request {
  return new Request('http://localhost:3000/api/admin/sources/' + VALID_UUID + '/run', {
    method: 'POST',
  });
}

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

const stubSummary: RunSummary = {
  sourceId: VALID_UUID,
  runId: 'run-1',
  status: 'ok',
  itemsFound: 5,
  itemsNew: 3,
  itemsUpdated: 1,
  itemsErrored: 0,
  itemsDedupSkipped: 1,
  durationMs: 1234,
};

/* ------------------------------------------------------------------ */
/*  Reset between tests                                                */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  adminAuthorised = true;
  adminEmail = 'admin@example.com';
  dbSourceRows = [];
  auditLogInserts = [];
  mockRunOneFn = vi
    .fn<(...args: unknown[]) => Promise<RunSummary>>()
    .mockResolvedValue(stubSummary);
  revalidatedTags = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/sources/[id]/run', () => {
  it('returns 404 when the user is not an admin', async () => {
    adminAuthorised = false;

    // requireAdmin() throws NotFoundError, which Next.js treats as 404.
    // In unit tests we verify the throw rather than a Response.
    await expect(POST(makeRequest(), { params: makeParams(VALID_UUID) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('returns 422 when params.id is not a valid UUID', async () => {
    const response = await POST(makeRequest(), {
      params: makeParams('not-a-uuid'),
    });

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('UUID'),
    });
  });

  it('returns 404 when the source id does not exist in the database', async () => {
    dbSourceRows = []; // no rows found

    const response = await POST(makeRequest(), {
      params: makeParams(VALID_UUID),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('not found'),
    });
  });

  it('returns 200 with summary on a valid call, writes audit_log, and revalidates cache', async () => {
    dbSourceRows = [VALID_SOURCE_ROW];

    const response = await POST(makeRequest(), {
      params: makeParams(VALID_UUID),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      sourceId: VALID_UUID,
      status: 'ok',
      itemsFound: 5,
    });

    // runOne called with correct args
    expect(mockRunOneFn).toHaveBeenCalledWith(VALID_UUID, 'manual', 'admin@example.com');

    // audit_log row inserted
    expect(auditLogInserts).toHaveLength(1);
    expect(auditLogInserts[0]).toMatchObject({
      actor_email: 'admin@example.com',
      action: 'source.run_now',
      target_type: 'source',
      target_id: VALID_UUID,
    });

    // Cache revalidated
    expect(revalidatedTags).toContain('events:list');
  });

  // F4: Test for runOne throwing an error
  it('returns 500 with structured error when runOne throws', async () => {
    dbSourceRows = [VALID_SOURCE_ROW];
    mockRunOneFn = vi
      .fn<(...args: unknown[]) => Promise<RunSummary>>()
      .mockRejectedValue(new Error('Adapter resolution failed'));

    const response = await POST(makeRequest(), {
      params: makeParams(VALID_UUID),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
