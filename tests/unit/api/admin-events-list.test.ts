import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let adminAuthorised = true;

const NOW = new Date('2026-04-20T12:00:00.000Z');
const EARLIER = new Date('2026-04-20T11:00:00.000Z');
const EARLIEST = new Date('2026-04-20T10:00:00.000Z');

const VALID_UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const VALID_UUID_3 = '550e8400-e29b-41d4-a716-446655440003';

const fakeAdminEvents = [
  {
    id: VALID_UUID_1,
    title: 'Open Mic Night',
    startsAt: NOW.toISOString(),
    endsAt: null,
    region: 'burlington_area',
    category: 'music',
    status: 'pending_review',
    sourceName: 'Test Source',
    submitterEmail: null,
    dedupCandidatesCount: 0,
    createdAt: NOW.toISOString(),
  },
  {
    id: VALID_UUID_2,
    title: 'Farmers Market',
    startsAt: EARLIER.toISOString(),
    endsAt: null,
    region: 'central_vt',
    category: 'farmers_market',
    status: 'pending_review',
    sourceName: null,
    submitterEmail: 'user@example.com',
    dedupCandidatesCount: 2,
    createdAt: EARLIER.toISOString(),
  },
  {
    id: VALID_UUID_3,
    title: 'Art Show',
    startsAt: EARLIEST.toISOString(),
    endsAt: null,
    region: 'southern_vt',
    category: 'arts_theater',
    status: 'pending_review',
    sourceName: 'Gallery Source',
    submitterEmail: null,
    dedupCandidatesCount: 0,
    createdAt: EARLIEST.toISOString(),
  },
];

let mockListAdminEventsFn = vi.fn();
let mockUpdateFn = vi.fn();
let mockInsertFn = vi.fn();

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

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({
    userId: 'user_123',
    sessionClaims: { email: 'admin@example.com' },
  }),
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

vi.mock('@/lib/db/queries/events', async () => {
  const schema = await import('@/lib/db/queries/events-schema');
  return {
    listAdminEvents: (...args: unknown[]) => mockListAdminEventsFn(...args),
    AdminEventsQuerySchema: schema.AdminEventsQuerySchema,
    BulkActionSchema: schema.BulkActionSchema,
  };
});

vi.mock('@/lib/db/client', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdateFn(...args),
    insert: (...args: unknown[]) => mockInsertFn(...args),
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

/* ------------------------------------------------------------------ */
/*  Import route under test                                            */
/* ------------------------------------------------------------------ */

import { GET, POST } from '@/app/api/admin/events/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGetRequest(queryString = ''): Request {
  return new Request('http://localhost:3000/api/admin/events' + queryString, { method: 'GET' });
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/admin/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  adminAuthorised = true;
  mockListAdminEventsFn = vi.fn().mockResolvedValue({
    events: fakeAdminEvents,
    nextCursor: null,
  });
  mockUpdateFn = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  mockInsertFn = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: GET /api/admin/events                                       */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/events', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(GET(makeGetRequest())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns events with ok: true', async () => {
    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.events).toHaveLength(3);
  });

  it('passes query params to listAdminEvents', async () => {
    await GET(makeGetRequest('?status=pending_review&q=open+mic'));
    expect(mockListAdminEventsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending_review',
        q: 'open mic',
      }),
    );
  });

  it('pagination cursor round-trip', async () => {
    // Encode a cursor
    const { encodeAdminCursor } = await import('@/lib/db/queries/events-schema');
    const cursor = encodeAdminCursor(NOW, VALID_UUID_1);

    // Set up mock to return with nextCursor
    mockListAdminEventsFn = vi.fn().mockResolvedValue({
      events: [fakeAdminEvents[0]],
      nextCursor: cursor,
    });

    const res1 = await GET(makeGetRequest());
    const body1 = await res1.json();
    expect(body1.data.nextCursor).toBe(cursor);

    // Use cursor in next request
    await GET(makeGetRequest('?cursor=' + encodeURIComponent(cursor)));
    expect(mockListAdminEventsFn).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  it('returns 422 for invalid cursor', async () => {
    mockListAdminEventsFn = vi.fn().mockRejectedValue(new Error('Invalid cursor payload'));

    const response = await GET(makeGetRequest('?cursor=bad'));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/events (bulk)                               */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/events', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(
      POST(
        makePostRequest({
          action: 'approve',
          ids: [VALID_UUID_1],
        }),
      ),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('approves events with valid body', async () => {
    const response = await POST(
      makePostRequest({
        action: 'approve',
        ids: [VALID_UUID_1, VALID_UUID_2],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.updated).toBe(2);
    expect(body.data.status).toBe('published');
  });

  it('rejects events with valid body', async () => {
    const response = await POST(
      makePostRequest({
        action: 'reject',
        ids: [VALID_UUID_3],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('rejected');
  });

  it('enforces max 50 ids', async () => {
    const tooManyIds = Array.from(
      { length: 51 },
      (_, i) => '550e8400-e29b-41d4-a716-' + String(i).padStart(12, '0'),
    );

    const response = await POST(makePostRequest({ action: 'approve', ids: tooManyIds }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 for invalid JSON body', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      }),
    );
    expect(response.status).toBe(422);
  });

  it('returns 422 for missing action', async () => {
    const response = await POST(makePostRequest({ ids: [VALID_UUID_1] }));
    expect(response.status).toBe(422);
  });
});
