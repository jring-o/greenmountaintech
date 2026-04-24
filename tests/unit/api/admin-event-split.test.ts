import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let adminAuthorised = true;

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';

function makeFakeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
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
    dedup_candidates: [
      {
        event_id: '550e8400-e29b-41d4-a716-446655440099',
        score: 0.85,
        reason: 'title=0.90 venue=0.80 time=0.70 total=0.850',
      },
    ],
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

let mockSelectFn = vi.fn();
let mockTransactionFn = vi.fn();

function resetDbMocks(fakeRows: unknown[] = [makeFakeEvent()]) {
  mockSelectFn = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(fakeRows),
      }),
    }),
  });

  mockTransactionFn = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };
    await fn(tx);
  });
}

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
  revalidatePath: vi.fn(),
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

vi.mock('@/lib/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelectFn(...args),
    update: () => ({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    insert: () => ({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: (...args: unknown[]) => mockTransactionFn(...args),
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

/* ------------------------------------------------------------------ */
/*  Import route under test                                            */
/* ------------------------------------------------------------------ */

import { revalidateTag } from 'next/cache';

import { POST as SplitPost } from '@/app/api/admin/events/[id]/split/route';

const mockRevalidateTag = vi.mocked(revalidateTag);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makePostRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/events/${id}/split`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ id }) },
  ];
}

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  adminAuthorised = true;
  resetDbMocks();
  mockRevalidateTag.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/events/[id]/split                           */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/events/[id]/split', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePostRequest(VALID_UUID);
    await expect(SplitPost(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePostRequest('not-a-uuid');
    const res = await SplitPost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when event not found', async () => {
    resetDbMocks([]);
    const [req, ctx] = makePostRequest(VALID_UUID);
    const res = await SplitPost(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('happy path: clears dedup_candidates and writes audit event.split', async () => {
    const fakeEvent = makeFakeEvent();
    resetDbMocks([fakeEvent]);

    const [req, ctx] = makePostRequest(VALID_UUID);
    const res = await SplitPost(req, ctx);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(VALID_UUID);
    expect(body.data.dedupCandidates).toEqual([]);

    // Status should remain unchanged (pending_review)
    expect(body.data.status).toBe('pending_review');

    // Transaction was called (update + audit insert)
    expect(mockTransactionFn).toHaveBeenCalledTimes(1);

    // Verify the transaction callback did the right things
    const txCallback = mockTransactionFn.mock.calls[0]![0] as (tx: unknown) => Promise<void>;
    const txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    const txInsertValues = vi.fn().mockResolvedValue(undefined);
    const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
    const fakeTx = { update: txUpdate, insert: txInsert };
    await txCallback(fakeTx);

    // Verify audit insert was called with event.split action
    expect(txInsert).toHaveBeenCalled();
    const auditValues = txInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(auditValues.action).toBe('event.split');
    expect(auditValues.target_type).toBe('event');
    expect(auditValues.target_id).toBe(VALID_UUID);
    expect(auditValues.after).toEqual({ dedup_candidates: [] });
  });

  it('leaves status unchanged after split', async () => {
    // Test with a different starting status
    const fakeEvent = makeFakeEvent({ status: 'pending_review' });
    resetDbMocks([fakeEvent]);

    const [req, ctx] = makePostRequest(VALID_UUID);
    const res = await SplitPost(req, ctx);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe('pending_review');
  });

  it('calls revalidateTag on success', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID);
    await SplitPost(req, ctx);
    expect(mockRevalidateTag).toHaveBeenCalledWith('events:list', 'max');
  });

  it('returns 500 when database throws an error', async () => {
    mockTransactionFn = vi.fn().mockRejectedValue(new Error('DB error'));
    const [req, ctx] = makePostRequest(VALID_UUID);
    const res = await SplitPost(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
