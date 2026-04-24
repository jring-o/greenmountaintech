import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

let insertedValues: unknown = null;

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: () => ({
      values: (vals: unknown) => {
        insertedValues = vals;
        return Promise.resolve();
      },
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
  },
}));

/* ------------------------------------------------------------------ */
/*  Import module under test                                           */
/* ------------------------------------------------------------------ */

import { writeAudit } from '@/lib/db/queries/audit';

/* ------------------------------------------------------------------ */
/*  Reset                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  insertedValues = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('writeAudit', () => {
  it('inserts a row with correct field mapping', async () => {
    await writeAudit({
      actorEmail: 'admin@example.com',
      action: 'event.approve',
      targetType: 'event',
      targetId: '550e8400-e29b-41d4-a716-446655440001',
      before: { status: 'pending_review' },
      after: { status: 'published' },
    });

    expect(insertedValues).toEqual({
      actor_email: 'admin@example.com',
      action: 'event.approve',
      target_type: 'event',
      target_id: '550e8400-e29b-41d4-a716-446655440001',
      before: { status: 'pending_review' },
      after: { status: 'published' },
    });
  });

  it('serialises complex JSONB before/after correctly', async () => {
    const complexBefore = {
      title: 'Old Title',
      tags: ['music', 'live'],
      nested: { venue: { name: 'Club' } },
    };
    const complexAfter = {
      title: 'New Title',
      tags: ['music', 'live', 'outdoor'],
      nested: { venue: { name: 'Arena' } },
    };

    await writeAudit({
      actorEmail: 'admin@test.com',
      action: 'event.edit',
      targetType: 'event',
      targetId: '550e8400-e29b-41d4-a716-446655440002',
      before: complexBefore,
      after: complexAfter,
    });

    const vals = insertedValues as Record<string, unknown>;
    expect(vals.before).toEqual(complexBefore);
    expect(vals.after).toEqual(complexAfter);
  });

  it('handles null before/after', async () => {
    await writeAudit({
      actorEmail: 'admin@test.com',
      action: 'event.reject',
      targetType: 'event',
      targetId: '550e8400-e29b-41d4-a716-446655440003',
    });

    const vals = insertedValues as Record<string, unknown>;
    expect(vals.before).toBeNull();
    expect(vals.after).toBeNull();
  });

  it('preserves numeric values in JSONB', async () => {
    await writeAudit({
      actorEmail: 'admin@test.com',
      action: 'event.edit',
      targetType: 'event',
      targetId: '550e8400-e29b-41d4-a716-446655440004',
      before: { count: 0, price: 19.99 },
      after: { count: 5, price: 24.99 },
    });

    const vals = insertedValues as Record<string, unknown>;
    const beforeObj = vals.before as Record<string, number>;
    const afterObj = vals.after as Record<string, number>;
    expect(beforeObj.count).toBe(0);
    expect(beforeObj.price).toBe(19.99);
    expect(afterObj.count).toBe(5);
    expect(afterObj.price).toBe(24.99);
  });
});
