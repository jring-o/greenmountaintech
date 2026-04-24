import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let adminAuthorised = true;

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440001';
const TARGET_UUID = '550e8400-e29b-41d4-a716-446655440002';

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

let mockSelectFn = vi.fn();
let mockUpdateSetFn = vi.fn();
let mockUpdateWhereFn = vi.fn();
let mockInsertValuesFn = vi.fn();
let mockTransactionFn = vi.fn();

function resetDbMocks(fakeRows: unknown[] = [makeFakeEvent()]) {
  mockUpdateWhereFn = vi.fn().mockResolvedValue(undefined);
  mockUpdateSetFn = vi.fn().mockReturnValue({ where: mockUpdateWhereFn });
  mockInsertValuesFn = vi.fn().mockResolvedValue(undefined);

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
      set: (...setArgs: unknown[]) => mockUpdateSetFn(...setArgs),
    }),
    insert: () => ({
      values: (...args: unknown[]) => mockInsertValuesFn(...args),
    }),
    transaction: (...args: unknown[]) => mockTransactionFn(...args),
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

/* ------------------------------------------------------------------ */
/*  Import routes under test                                           */
/* ------------------------------------------------------------------ */

import { revalidatePath, revalidateTag } from 'next/cache';

import { POST as ApprovePost } from '@/app/api/admin/events/[id]/approve/route';
import { POST as MergePost } from '@/app/api/admin/events/[id]/merge/route';
import { POST as RejectPost } from '@/app/api/admin/events/[id]/reject/route';
import { PATCH } from '@/app/api/admin/events/[id]/route';

const mockRevalidateTag = vi.mocked(revalidateTag);
const mockRevalidatePath = vi.mocked(revalidatePath);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makePatchRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makeRawPatchRequest(
  id: string,
  rawBody: string,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makePostRequest(
  id: string,
  path: string,
  body?: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/events/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makeRawPostRequest(
  id: string,
  path: string,
  rawBody: string,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/events/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
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
  mockRevalidatePath.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: PATCH /api/admin/events/[id]                                */
/* ------------------------------------------------------------------ */

describe('PATCH /api/admin/events/[id]', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'New Title' });
    await expect(PATCH(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePatchRequest('not-a-uuid', { title: 'New Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
  });

  it('returns 422 for invalid body', async () => {
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: '' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when event not found', async () => {
    resetDbMocks([]);
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'New Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('happy path: updates event and writes audit', async () => {
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'Updated Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(VALID_UUID);

    // Verify transaction was called (update + audit insert)
    expect(mockTransactionFn).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for invalid JSON body', async () => {
    const [req, ctx] = makeRawPatchRequest(VALID_UUID, '{not valid json');
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe('Invalid JSON body');
  });

  it('skips transaction when body is empty (no changes)', async () => {
    const [req, ctx] = makePatchRequest(VALID_UUID, {});
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  it('skips transaction when patch values match current values', async () => {
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'Open Mic Night' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        }),
      }),
    });
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'New Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('calls revalidatePath when status involves published', async () => {
    resetDbMocks([makeFakeEvent({ status: 'published' })]);
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'Updated Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
  });

  it('calls revalidateTag on every successful update', async () => {
    const [req, ctx] = makePatchRequest(VALID_UUID, { title: 'Updated Title' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenCalledWith('events:list', 'max');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/events/[id]/approve                        */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/events/[id]/approve', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    await expect(ApprovePost(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 404 when event not found', async () => {
    resetDbMocks([]);
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    const res = await ApprovePost(req, ctx);
    expect(res.status).toBe(404);
  });

  it('happy path: approves event and writes audit', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    const res = await ApprovePost(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('published');
    expect(mockTransactionFn).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePostRequest('not-a-uuid', 'approve');
    const res = await ApprovePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('still succeeds when event is already published (idempotent)', async () => {
    resetDbMocks([
      makeFakeEvent({
        status: 'published',
        published_at: new Date('2026-04-20T12:00:00Z'),
      }),
    ]);
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    const res = await ApprovePost(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('published');
  });

  it('returns 500 when database throws an error', async () => {
    mockTransactionFn = vi.fn().mockRejectedValue(new Error('DB error'));
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    const res = await ApprovePost(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('calls cache invalidation on approve', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'approve');
    await ApprovePost(req, ctx);
    expect(mockRevalidateTag).toHaveBeenCalledWith('events:list', 'max');
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/events/[id]/reject                         */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/events/[id]/reject', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    await expect(RejectPost(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 404 when event not found', async () => {
    resetDbMocks([]);
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(404);
  });

  it('happy path: rejects event and writes audit', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('rejected');
    expect(mockTransactionFn).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePostRequest('not-a-uuid', 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('calls revalidatePath when rejecting a previously published event', async () => {
    resetDbMocks([makeFakeEvent({ status: 'published' })]);
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
  });

  it('does not call revalidatePath when rejecting a non-published event', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws an error', async () => {
    mockTransactionFn = vi.fn().mockRejectedValue(new Error('DB error'));
    const [req, ctx] = makePostRequest(VALID_UUID, 'reject');
    const res = await RejectPost(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/events/[id]/merge                          */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/events/[id]/merge', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    await expect(MergePost(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 422 for missing targetId', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', {});
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when source event not found', async () => {
    resetDbMocks([]);
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 422 when target is not published', async () => {
    // First call returns source event, second returns unpublished target
    const sourceEvent = makeFakeEvent();
    const targetEvent = makeFakeEvent({
      id: TARGET_UUID,
      status: 'pending_review',
    });

    // Override select to return different results for sequential calls
    let callCount = 0;
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([sourceEvent]);
            return Promise.resolve([targetEvent]);
          }),
        }),
      }),
    });

    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('published');
  });

  it('happy path: merges event and writes audit', async () => {
    // Source event and published target
    const sourceEvent = makeFakeEvent();
    const targetEvent = makeFakeEvent({
      id: TARGET_UUID,
      status: 'published',
      published_at: new Date('2026-04-19T12:00:00Z'),
    });

    let callCount = 0;
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([sourceEvent]);
            return Promise.resolve([targetEvent]);
          }),
        }),
      }),
    });

    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('duplicate');
    expect(body.data.mergedInto).toBe(TARGET_UUID);
    expect(mockTransactionFn).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePostRequest('not-a-uuid', 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when merging an event into itself', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: VALID_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('itself');
  });

  it('returns 422 for invalid JSON body', async () => {
    const [req, ctx] = makeRawPostRequest(VALID_UUID, 'merge', '{bad json');
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid JSON body');
  });

  it('returns 422 for non-UUID targetId', async () => {
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: 'not-a-uuid' });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when target event does not exist', async () => {
    const sourceEvent = makeFakeEvent();
    let callCount = 0;
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([sourceEvent]);
            return Promise.resolve([]);
          }),
        }),
      }),
    });
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('published');
  });

  it('returns 500 when database throws an error', async () => {
    const sourceEvent = makeFakeEvent();
    const targetEvent = makeFakeEvent({
      id: TARGET_UUID,
      status: 'published',
      published_at: new Date('2026-04-19T12:00:00Z'),
    });
    let callCount = 0;
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([sourceEvent]);
            return Promise.resolve([targetEvent]);
          }),
        }),
      }),
    });
    mockTransactionFn = vi.fn().mockRejectedValue(new Error('DB error'));
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('calls revalidatePath when merging a published source event', async () => {
    const sourceEvent = makeFakeEvent({ status: 'published' });
    const targetEvent = makeFakeEvent({
      id: TARGET_UUID,
      status: 'published',
      published_at: new Date('2026-04-19T12:00:00Z'),
    });
    let callCount = 0;
    mockSelectFn = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve([sourceEvent]);
            return Promise.resolve([targetEvent]);
          }),
        }),
      }),
    });
    const [req, ctx] = makePostRequest(VALID_UUID, 'merge', { targetId: TARGET_UUID });
    const res = await MergePost(req, ctx);
    expect(res.status).toBe(200);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${VALID_UUID}`);
  });
});
