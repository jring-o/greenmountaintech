import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let adminAuthorised = true;

/** Fake run rows returned by the mock listRuns / getRunWithItems */
const NOW = new Date('2026-04-20T12:00:00.000Z');
const EARLIER = new Date('2026-04-20T11:00:00.000Z');
const EARLIEST = new Date('2026-04-20T10:00:00.000Z');

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const VALID_UUID_3 = '550e8400-e29b-41d4-a716-446655440003';
const SOURCE_ID = '660e8400-e29b-41d4-a716-446655440000';

const fakeRunListItems = [
  {
    id: VALID_UUID_1,
    source_id: SOURCE_ID,
    source_name: 'Test Source',
    started_at: NOW.toISOString(),
    finished_at: NOW.toISOString(),
    status: 'ok',
    items_found: 10,
    items_new: 5,
    items_updated: 3,
    items_errored: 0,
    duration_ms: 1234,
  },
  {
    id: VALID_UUID_2,
    source_id: SOURCE_ID,
    source_name: 'Test Source',
    started_at: EARLIER.toISOString(),
    finished_at: EARLIER.toISOString(),
    status: 'partial',
    items_found: 8,
    items_new: 2,
    items_updated: 1,
    items_errored: 2,
    duration_ms: 2345,
  },
  {
    id: VALID_UUID_3,
    source_id: SOURCE_ID,
    source_name: 'Test Source',
    started_at: EARLIEST.toISOString(),
    finished_at: EARLIEST.toISOString(),
    status: 'error',
    items_found: 0,
    items_new: 0,
    items_updated: 0,
    items_errored: 0,
    duration_ms: 500,
  },
];

const fakeRunDetail = {
  run: {
    id: VALID_UUID_1,
    source_id: SOURCE_ID,
    started_at: NOW,
    finished_at: NOW,
    triggered_by: 'cron' as const,
    triggered_by_email: null,
    items_found: 10,
    items_new: 5,
    items_updated: 3,
    items_errored: 0,
    items_dedup_skipped: 2,
    error_log: [],
    duration_ms: 1234,
    status: 'ok',
  },
  source: { id: SOURCE_ID, name: 'Test Source', slug: 'test-source' },
  items: [
    {
      id: 'evt-1',
      title: 'Test Event',
      status: 'published',
      created_at: NOW.toISOString(),
    },
  ],
};

let mockListRunsFn = vi.fn();
let mockGetRunWithItemsFn = vi.fn();

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
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

vi.mock('@/lib/db/queries/runs', () => ({
  listRuns: (...args: unknown[]) => mockListRunsFn(...args),
  getRunWithItems: (...args: unknown[]) => mockGetRunWithItemsFn(...args),
}));

/* ------------------------------------------------------------------ */
/*  Import the route handlers under test                               */
/* ------------------------------------------------------------------ */

import { GET as detailGET } from '@/app/api/admin/runs/[id]/route';
import { GET as listGET } from '@/app/api/admin/runs/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeListRequest(queryString = ''): Request {
  return new Request('http://localhost:3000/api/admin/runs' + queryString, {
    method: 'GET',
  });
}

function makeDetailRequest(id: string): Request {
  return new Request('http://localhost:3000/api/admin/runs/' + id, {
    method: 'GET',
  });
}

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  adminAuthorised = true;
  mockListRunsFn = vi.fn().mockResolvedValue({
    runs: fakeRunListItems,
    nextCursor: null,
  });
  mockGetRunWithItemsFn = vi.fn().mockResolvedValue(fakeRunDetail);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: GET /api/admin/runs                                         */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/runs', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(listGET(makeListRequest())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns runs in descending order', async () => {
    const response = await listGET(makeListRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.runs).toHaveLength(3);

    // Verify descending order by started_at
    const startedDates = body.data.runs.map((r: { started_at: string }) => r.started_at);
    expect(new Date(startedDates[0]).getTime()).toBeGreaterThanOrEqual(
      new Date(startedDates[1]).getTime(),
    );
    expect(new Date(startedDates[1]).getTime()).toBeGreaterThanOrEqual(
      new Date(startedDates[2]).getTime(),
    );
  });

  it('passes cursor to listRuns when provided', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ started_at: NOW.toISOString(), id: VALID_UUID_1 }),
    ).toString('base64url');

    await listGET(makeListRequest('?cursor=' + cursor));

    expect(mockListRunsFn).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  it('defaults limit to 25 when no limit param is provided', async () => {
    await listGET(makeListRequest());

    expect(mockListRunsFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it('clamps limit to 1 when a negative value is provided', async () => {
    await listGET(makeListRequest('?limit=-5'));

    expect(mockListRunsFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it('clamps limit to 100 when a value above 100 is provided', async () => {
    await listGET(makeListRequest('?limit=999'));

    expect(mockListRunsFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('falls back to 25 when limit param is non-numeric', async () => {
    await listGET(makeListRequest('?limit=abc'));

    expect(mockListRunsFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: GET /api/admin/runs/[id]                                    */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/runs/[id]', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(
      detailGET(makeDetailRequest(VALID_UUID_1), { params: makeParams(VALID_UUID_1) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 422 when id is not a valid UUID', async () => {
    const response = await detailGET(makeDetailRequest('not-a-uuid'), {
      params: makeParams('not-a-uuid'),
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when run is not found', async () => {
    mockGetRunWithItemsFn = vi.fn().mockResolvedValue(null);

    const response = await detailGET(makeDetailRequest(VALID_UUID_1), {
      params: makeParams(VALID_UUID_1),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns the run detail with source and joined events', async () => {
    const response = await detailGET(makeDetailRequest(VALID_UUID_1), {
      params: makeParams(VALID_UUID_1),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    // Verify run
    expect(body.data.run.id).toBe(VALID_UUID_1);
    expect(body.data.run.status).toBe('ok');

    // Verify source joined
    expect(body.data.source.name).toBe('Test Source');
    expect(body.data.source.slug).toBe('test-source');

    // Verify events joined
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe('Test Event');
  });
});
