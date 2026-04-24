import { describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks -- prevent env/db initialisation from running                 */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://mock',
    DATABASE_URL_UNPOOLED: 'postgresql://mock',
    CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
    CLERK_SECRET_KEY: 'sk_test_mock',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_mock',
    ADMIN_EMAILS: ['admin@example.com'],
    CRON_SECRET: 'mock-secret',
    USER_AGENT_CONTACT: 'mock@example.com',
    SUBMISSION_IP_SALT: 'mock-salt',
  },
}));

vi.mock('@/lib/db/client', () => ({
  db: {},
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                  */
/* ------------------------------------------------------------------ */

import { decodeRunCursor, encodeRunCursor } from '@/lib/db/queries/runs';

/* ------------------------------------------------------------------ */
/*  encodeRunCursor / decodeRunCursor round-trip                        */
/* ------------------------------------------------------------------ */

describe('encodeRunCursor / decodeRunCursor', () => {
  it('round-trips: encode then decode returns the same started_at and id', () => {
    const startedAt = new Date('2026-04-20T12:00:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440001';

    const cursor = encodeRunCursor(startedAt, id);
    const decoded = decodeRunCursor(cursor);

    expect(decoded.started_at).toBe(startedAt.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('deterministic: same inputs produce same cursor', () => {
    const startedAt = new Date('2026-04-20T12:00:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440001';

    const a = encodeRunCursor(startedAt, id);
    const b = encodeRunCursor(startedAt, id);

    expect(a).toBe(b);
  });

  it('different inputs produce different cursors', () => {
    const date = new Date('2026-04-20T12:00:00.000Z');
    const id1 = '550e8400-e29b-41d4-a716-446655440001';
    const id2 = '550e8400-e29b-41d4-a716-446655440002';

    const a = encodeRunCursor(date, id1);
    const b = encodeRunCursor(date, id2);

    expect(a).not.toBe(b);
  });

  it('handles edge-case dates (epoch, far future)', () => {
    const epoch = new Date(0);
    const future = new Date('2099-12-31T23:59:59.999Z');
    const id = '00000000-0000-0000-0000-000000000000';

    const e1 = encodeRunCursor(epoch, id);
    const d1 = decodeRunCursor(e1);
    expect(d1.started_at).toBe(epoch.toISOString());

    const e2 = encodeRunCursor(future, id);
    const d2 = decodeRunCursor(e2);
    expect(d2.started_at).toBe(future.toISOString());
  });

  it('produces a base64url-encoded string (no +, /, or = padding)', () => {
    const startedAt = new Date('2026-04-20T12:00:00.000Z');
    const id = '550e8400-e29b-41d4-a716-446655440001';

    const cursor = encodeRunCursor(startedAt, id);

    // base64url uses - and _ instead of + and /
    expect(cursor).not.toMatch(/[+/=]/);
    // Should be a non-empty string
    expect(cursor.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  decodeRunCursor error paths                                         */
/* ------------------------------------------------------------------ */

describe('decodeRunCursor error paths', () => {
  it('throws on invalid base64', () => {
    expect(() => decodeRunCursor('!!not-base64!!')).toThrow();
  });

  it('throws on valid base64 but invalid JSON', () => {
    const notJson = Buffer.from('not json at all').toString('base64url');
    expect(() => decodeRunCursor(notJson)).toThrow();
  });

  it('throws when payload is missing started_at field', () => {
    const payload = Buffer.from(JSON.stringify({ id: 'abc' })).toString('base64url');
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload');
  });

  it('throws when payload is missing id field', () => {
    const payload = Buffer.from(
      JSON.stringify({ started_at: '2026-01-01T00:00:00.000Z' }),
    ).toString('base64url');
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload');
  });

  it('throws when started_at is not a string', () => {
    const payload = Buffer.from(JSON.stringify({ started_at: 12345, id: 'abc' })).toString(
      'base64url',
    );
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload types');
  });

  it('throws when id is not a string', () => {
    const payload = Buffer.from(
      JSON.stringify({ started_at: '2026-01-01T00:00:00.000Z', id: 999 }),
    ).toString('base64url');
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload types');
  });

  it('throws when started_at is not a valid date string', () => {
    const payload = Buffer.from(JSON.stringify({ started_at: 'not-a-date', id: 'abc' })).toString(
      'base64url',
    );
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor date');
  });

  it('throws when payload is a JSON array instead of object', () => {
    const payload = Buffer.from(JSON.stringify([1, 2, 3])).toString('base64url');
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload');
  });

  it('throws when payload is null', () => {
    const payload = Buffer.from(JSON.stringify(null)).toString('base64url');
    expect(() => decodeRunCursor(payload)).toThrow('Invalid cursor payload');
  });
});
