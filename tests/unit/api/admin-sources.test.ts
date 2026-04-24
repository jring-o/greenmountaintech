import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let adminAuthorised = true;
let adminEmail = 'admin@example.com';
let mockSourceRows: Record<string, unknown>[] = [];
let mockInsertReturn: Record<string, unknown>[] = [];
let auditWriteCalls: Record<string, unknown>[] = [];
let mockUpdateReturn: Record<string, unknown>[] = [];

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeFakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    name: 'Test Source',
    slug: 'test-source',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    url: 'https://example.com/feed.ics',
    adapter_config: {},
    trust_level: 'review',
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
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
    userId: adminAuthorised ? 'user_123' : null,
    sessionClaims: adminAuthorised ? { email: adminEmail } : {},
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

// Mock the adapter registry -- must build inside factory since vi.mock is hoisted
vi.mock('@/lib/adapters/index', () => {
  const reg = new Map<string, { key: string; configSchema?: unknown }>();
  reg.set('ical:generic', { key: 'generic' });
  reg.set('rss:generic', { key: 'generic' });
  reg.set('html:hello-burlington-vt', { key: 'hello-burlington-vt' });
  return {
    _registry: reg,
    getAdapterKeysByType: () => ({
      ical: ['generic'],
      rss: ['generic'],
      html: ['hello-burlington-vt'],
    }),
  };
});

// Mock the query functions
vi.mock('@/lib/db/queries/sources', () => ({
  listSources: async () => mockSourceRows,
  getSource: async (id: string) => {
    return mockSourceRows.find((r) => r.id === id) ?? null;
  },
  createSource: async (input: Record<string, unknown>) => {
    const row = { id: VALID_UUID, ...input, created_at: new Date(), updated_at: new Date() };
    mockInsertReturn.push(row);
    return row;
  },
  updateSource: async (id: string, patch: Record<string, unknown>) => {
    const existing = mockSourceRows.find((r) => r.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updated_at: new Date() };
    mockUpdateReturn.push(updated);
    return updated;
  },
  softDeleteSource: async (id: string) => {
    const existing = mockSourceRows.find((r) => r.id === id);
    if (!existing) return null;
    const updated = { ...existing, is_active: false, updated_at: new Date() };
    mockUpdateReturn.push(updated);
    return updated;
  },
}));

// Mock audit log
vi.mock('@/lib/db/queries/audit', () => ({
  writeAudit: async (params: Record<string, unknown>) => {
    auditWriteCalls.push(params);
  },
}));

vi.mock('@/lib/db/schema', async () => {
  const actual = await vi.importActual('@/lib/db/schema');
  return actual;
});

/* ------------------------------------------------------------------ */
/*  Import routes under test                                           */
/* ------------------------------------------------------------------ */

import { DELETE, PATCH } from '@/app/api/admin/sources/[id]/route';
import { GET, POST } from '@/app/api/admin/sources/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost:3000/api/admin/sources${query}`, {
    method: 'GET',
  });
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/admin/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makeDeleteRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/sources/${id}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id }) },
  ];
}

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  adminAuthorised = true;
  adminEmail = 'admin@example.com';
  mockSourceRows = [];
  mockInsertReturn = [];
  auditWriteCalls = [];
  mockUpdateReturn = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests: GET /api/admin/sources                                      */
/* ------------------------------------------------------------------ */

describe('GET /api/admin/sources', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(GET(makeGetRequest())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns a list of sources', async () => {
    mockSourceRows = [makeFakeSource()];
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Test Source');
  });

  it('returns 200 with empty array when no sources exist', async () => {
    mockSourceRows = [];
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('passes kind filter from query string', async () => {
    mockSourceRows = [makeFakeSource({ kind: 'whitelist' })];
    const res = await GET(makeGetRequest('?kind=whitelist'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('passes is_active filter from query string', async () => {
    mockSourceRows = [makeFakeSource({ is_active: true })];
    const res = await GET(makeGetRequest('?is_active=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('passes combined kind and is_active filters', async () => {
    mockSourceRows = [makeFakeSource({ kind: 'admin_added', is_active: false })];
    const res = await GET(makeGetRequest('?kind=admin_added&is_active=false'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: POST /api/admin/sources                                     */
/* ------------------------------------------------------------------ */

describe('POST /api/admin/sources', () => {
  const validBody = {
    name: 'New iCal Feed',
    slug: 'new-ical-feed',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    url: 'https://example.com/events.ics',
  };

  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    await expect(POST(makePostRequest(validBody))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns 201 with rss adapter type', async () => {
    const res = await POST(
      makePostRequest({
        ...validBody,
        adapter_type: 'rss',
        adapter_key: 'generic',
        slug: 'rss-feed',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 422 on invalid adapter_key (not in registry)', async () => {
    const res = await POST(
      makePostRequest({
        ...validBody,
        adapter_key: 'nonexistent',
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain('not registered');
  });

  it('returns 201 on valid create and writes source.create audit', async () => {
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe('New iCal Feed');

    // Audit log should have been written
    expect(auditWriteCalls).toHaveLength(1);
    expect(auditWriteCalls[0]).toMatchObject({
      actorEmail: 'admin@example.com',
      action: 'source.create',
      targetType: 'source',
    });
  });

  it('returns 422 on invalid body (missing name)', async () => {
    const res = await POST(
      makePostRequest({
        slug: 'test',
        kind: 'whitelist',
        adapter_type: 'ical',
        adapter_key: 'generic',
        url: 'https://example.com/feed.ics',
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 on invalid JSON body', async () => {
    const req = new Request('http://localhost:3000/api/admin/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid JSON body');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: PATCH /api/admin/sources/[id]                               */
/* ------------------------------------------------------------------ */

describe('PATCH /api/admin/sources/[id]', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makePatchRequest(VALID_UUID, { name: 'Updated' });
    await expect(PATCH(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('writes source.update audit for non-toggle changes', async () => {
    mockSourceRows = [makeFakeSource()];
    const [req, ctx] = makePatchRequest(VALID_UUID, { name: 'Updated Name' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe('Updated Name');
    expect(auditWriteCalls).toHaveLength(1);
    expect(auditWriteCalls[0]).toMatchObject({
      action: 'source.update',
      targetType: 'source',
      targetId: VALID_UUID,
    });
  });

  it('returns 422 on invalid JSON body for PATCH', async () => {
    const req = new Request('http://localhost:3000/api/admin/sources/' + VALID_UUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const ctx = { params: Promise.resolve({ id: VALID_UUID }) };
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid JSON body');
  });

  it('returns 422 when adapter_type is changed to invalid combo', async () => {
    mockSourceRows = [makeFakeSource()];
    const [req, ctx] = makePatchRequest(VALID_UUID, {
      adapter_type: 'html',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('not registered');
  });

  it('writes source.disable audit when is_active flipped to false', async () => {
    mockSourceRows = [makeFakeSource({ is_active: true })];
    const [req, ctx] = makePatchRequest(VALID_UUID, { is_active: false });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Audit should record source.disable
    expect(auditWriteCalls).toHaveLength(1);
    expect(auditWriteCalls[0]).toMatchObject({
      action: 'source.disable',
      targetType: 'source',
      targetId: VALID_UUID,
    });
  });

  it('writes source.enable audit when is_active flipped to true', async () => {
    mockSourceRows = [makeFakeSource({ is_active: false })];
    const [req, ctx] = makePatchRequest(VALID_UUID, { is_active: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);

    expect(auditWriteCalls).toHaveLength(1);
    expect(auditWriteCalls[0]).toMatchObject({
      action: 'source.enable',
    });
  });

  it('returns 404 when source not found', async () => {
    mockSourceRows = [];
    const [req, ctx] = makePatchRequest(VALID_UUID, { name: 'Updated' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makePatchRequest('not-a-uuid', { name: 'Updated' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
  });

  it('returns 422 when adapter_key is changed to invalid value', async () => {
    mockSourceRows = [makeFakeSource()];
    const [req, ctx] = makePatchRequest(VALID_UUID, {
      adapter_key: 'nonexistent',
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('not registered');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: DELETE /api/admin/sources/[id]                              */
/* ------------------------------------------------------------------ */

describe('DELETE /api/admin/sources/[id]', () => {
  it('returns 404 (throws) when the user is not an admin', async () => {
    adminAuthorised = false;
    const [req, ctx] = makeDeleteRequest(VALID_UUID);
    await expect(DELETE(req, ctx)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('soft-deletes a source and writes source.disable audit', async () => {
    mockSourceRows = [makeFakeSource()];
    const [req, ctx] = makeDeleteRequest(VALID_UUID);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.is_active).toBe(false);

    // Audit log
    expect(auditWriteCalls).toHaveLength(1);
    expect(auditWriteCalls[0]).toMatchObject({
      action: 'source.disable',
      targetType: 'source',
      targetId: VALID_UUID,
      after: { is_active: false },
    });
  });

  it('returns 404 when source not found', async () => {
    mockSourceRows = [];
    const [req, ctx] = makeDeleteRequest(VALID_UUID);
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid UUID in path', async () => {
    const [req, ctx] = makeDeleteRequest('not-a-uuid');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(422);
  });
});
