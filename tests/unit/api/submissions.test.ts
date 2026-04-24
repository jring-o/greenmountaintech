import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let perIpCount = 0;
let globalCount = 0;
let insertedRows: Record<string, unknown>[] = [];
let mockCheckAndIncrement =
  vi.fn<(...args: unknown[]) => Promise<{ allowed: boolean; retryAfterSeconds: number }>>();
let mockCheckAndIncrementGlobal =
  vi.fn<() => Promise<{ allowed: boolean; retryAfterSeconds: number }>>();

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    SUBMISSION_IP_SALT: 'test-salt-that-is-at-least-32-characters-long!',
    TURNSTILE_SITE_KEY: undefined,
    TURNSTILE_SECRET_KEY: undefined,
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

vi.mock('@/lib/auth/ip', () => ({
  getClientIp: (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  hashIp: (ip: string) => `hash_${ip}`,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAndIncrement: (...args: unknown[]) => mockCheckAndIncrement(...args),
  checkAndIncrementGlobal: () => mockCheckAndIncrementGlobal(),
}));

vi.mock('@/lib/db/client', () => {
  const mockDb = {
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => {
          const id = `evt-${insertedRows.length + 1}`;
          const row = { ...vals, id };
          insertedRows.push(row);
          return [{ id }];
        },
      }),
    }),
  };
  return { db: mockDb };
});

vi.mock('@/lib/ingest/dedupe', () => ({
  computeDedupeKey: () => 'test-dedupe-key',
  findFuzzyCandidates: async () => [],
  slugify: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
}));

vi.mock('@/lib/tz', () => ({
  toUtc: (iso: string) => new Date(iso + 'Z'),
  DEFAULT_TZ: 'America/New_York',
}));

/* ------------------------------------------------------------------ */
/*  Import route handler after mocks                                    */
/* ------------------------------------------------------------------ */

import { POST } from '@/app/api/submissions/route';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const clientStartedAt = new Date(Date.now() - 10_000).toISOString(); // 10s ago
  return {
    title: 'Test Event Title',
    startsAtLocal: '2026-07-04T19:00:00',
    region: 'burlington_area',
    category: 'music',
    submitterEmail: 'test@example.com',
    clientStartedAt,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/submissions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                    */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  perIpCount = 0;
  globalCount = 0;
  insertedRows = [];

  mockCheckAndIncrement = vi.fn().mockImplementation(async () => {
    perIpCount++;
    if (perIpCount > 3) {
      return { allowed: false, retryAfterSeconds: 1800 };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  });

  mockCheckAndIncrementGlobal = vi.fn().mockImplementation(async () => {
    globalCount++;
    if (globalCount > 100) {
      return { allowed: false, retryAfterSeconds: 900 };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  });

  // Ensure Turnstile env is not set
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('POST /api/submissions', () => {
  /* ── Dwell checks ─────────────────────────────────────────────────── */

  it('returns 422 when dwell time is too short (< 4s)', async () => {
    const body = makeValidBody({
      clientStartedAt: new Date(Date.now() - 1_000).toISOString(), // 1s ago
    });
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('DWELL_CHECK_FAILED');
  });

  it('returns 422 when dwell time is too long (> 60 min)', async () => {
    const body = makeValidBody({
      clientStartedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(), // 70 min ago
    });
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('DWELL_CHECK_FAILED');
  });

  /* ── Honeypot ─────────────────────────────────────────────────────── */

  it('returns 204 when honeypot field hp_url is non-empty', async () => {
    const body = makeValidBody({ hp_url: 'http://spam.example.com' });
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(204);
    expect(insertedRows).toHaveLength(0);
  });

  /* ── Per-IP rate limit ────────────────────────────────────────────── */

  it('returns 429 with Retry-After when per-IP rate limit is exceeded', async () => {
    // Set up mock to deny immediately
    mockCheckAndIncrement = vi.fn().mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 1800,
    });

    const body = makeValidBody();
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('1800');
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT');
  });

  /* ── Global rate limit ────────────────────────────────────────────── */

  it('returns 429 with Retry-After when global rate limit is exceeded', async () => {
    mockCheckAndIncrementGlobal = vi.fn().mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 900,
    });

    const body = makeValidBody();
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('900');
    const json = await response.json();
    expect(json.ok).toBe(false);
  });

  /* ── Validation: end < start ──────────────────────────────────────── */

  it('returns 422 when endsAtLocal is before startsAtLocal', async () => {
    const body = makeValidBody({
      startsAtLocal: '2026-07-04T19:00:00',
      endsAtLocal: '2026-07-04T17:00:00', // before start
    });
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  /* ── Happy path ───────────────────────────────────────────────────── */

  it('returns 201 on happy path and inserts event with correct fields', async () => {
    const body = makeValidBody();
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(typeof json.data.id).toBe('string');

    // Verify inserted row
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0]!;
    expect(row.status).toBe('pending_review');
    expect(row.source_id).toBeNull();
    expect(row.submitter_email).toBe('test@example.com');
    expect(row.submitter_ip_hash).toBe('hash_1.2.3.4');
  });

  /* ── Validation: invalid JSON ─────────────────────────────────────── */

  it('returns 422 for invalid JSON body', async () => {
    const request = new Request('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '1.2.3.4',
      },
      body: 'not json at all{{{',
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('INVALID_JSON');
  });

  /* ── Validation: title too short ──────────────────────────────────── */

  it('returns 422 when title is too short', async () => {
    const body = makeValidBody({ title: 'ab' }); // min 3
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  /* ── No IP header ─────────────────────────────────────────────────── */

  it('returns 201 even without x-forwarded-for (skips per-IP check)', async () => {
    const body = makeValidBody();
    const request = new Request('http://localhost:3000/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.ok).toBe(true);

    // submitter_ip_hash should be null when no IP
    const row = insertedRows[0]!;
    expect(row.submitter_ip_hash).toBeNull();
  });

  /* ── Missing required field ───────────────────────────────────────── */

  it('returns 422 when required field submitterEmail is missing', async () => {
    const body = makeValidBody();
    delete body.submitterEmail;
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
