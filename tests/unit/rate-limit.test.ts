import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

type RateLimitRow = {
  ip_hash: string;
  count_1h: number;
  window_started_at: Date;
};

/**
 * In-memory store simulating the submission_rate_limits table.
 * Keyed by ip_hash.
 */
let store: Map<string, RateLimitRow>;

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    SUBMISSION_IP_SALT: 'test-salt-that-is-at-least-32-characters-long!',
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
  /**
   * Simulates the Drizzle insert().values().onConflictDoUpdate().returning()
   * chain against the in-memory store.
   */
  const mockDb = {
    insert: () => ({
      values: (vals: { ip_hash: string; count_1h: number }) => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            const key = vals.ip_hash;
            const existing = store.get(key);
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

            if (!existing) {
              // Insert
              const row: RateLimitRow = {
                ip_hash: key,
                count_1h: 1,
                window_started_at: now,
              };
              store.set(key, row);
              return [{ count_1h: 1, window_started_at: now }];
            }

            // On conflict update
            if (existing.window_started_at < oneHourAgo) {
              // Window expired -- reset
              existing.count_1h = 1;
              existing.window_started_at = now;
            } else {
              // Same window -- increment
              existing.count_1h += 1;
            }

            return [
              {
                count_1h: existing.count_1h,
                window_started_at: existing.window_started_at,
              },
            ];
          },
        }),
      }),
    }),
  };
  return { db: mockDb };
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                  */
/* ------------------------------------------------------------------ */

import { hashIp } from '@/lib/auth/ip';
import { checkAndIncrement, checkAndIncrementGlobal, lruCache } from '@/lib/rate-limit';

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                    */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  store = new Map();
  lruCache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Per-IP windowing                                                    */
/* ------------------------------------------------------------------ */

describe('checkAndIncrement (per-IP)', () => {
  it('allows the first 3 calls in the same window', async () => {
    const hash = 'ip-hash-aaa';

    const r1 = await checkAndIncrement(hash);
    expect(r1.allowed).toBe(true);

    const r2 = await checkAndIncrement(hash);
    expect(r2.allowed).toBe(true);

    const r3 = await checkAndIncrement(hash);
    expect(r3.allowed).toBe(true);
  });

  it('denies the 4th call in the same window', async () => {
    const hash = 'ip-hash-bbb';

    await checkAndIncrement(hash);
    await checkAndIncrement(hash);
    await checkAndIncrement(hash);

    const r4 = await checkAndIncrement(hash);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('returns retryAfterSeconds > 0 when denied', async () => {
    const hash = 'ip-hash-ccc';
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement(hash);
    }
    const r = await checkAndIncrement(hash);
    expect(r.allowed).toBe(false);
    expect(typeof r.retryAfterSeconds).toBe('number');
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it('resets after the window expires (cross-window)', async () => {
    const hash = 'ip-hash-ddd';

    // Fill up the window
    await checkAndIncrement(hash);
    await checkAndIncrement(hash);
    await checkAndIncrement(hash);

    const r4 = await checkAndIncrement(hash);
    expect(r4.allowed).toBe(false);

    // Simulate window expiry by backdating the store entry
    const entry = store.get(hash)!;
    entry.window_started_at = new Date(
      Date.now() - 61 * 60 * 1000, // 61 minutes ago
    );

    // Clear the LRU cache so it re-checks the DB
    lruCache.clear();

    const r5 = await checkAndIncrement(hash);
    expect(r5.allowed).toBe(true);
    expect(store.get(hash)!.count_1h).toBe(1);
  });

  it('tracks different IPs independently', async () => {
    const hashA = 'ip-hash-eee';
    const hashB = 'ip-hash-fff';

    // Fill hashA to limit
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement(hashA);
    }
    const rA = await checkAndIncrement(hashA);
    expect(rA.allowed).toBe(false);

    // hashB should still be allowed
    const rB = await checkAndIncrement(hashB);
    expect(rB.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Global cap                                                          */
/* ------------------------------------------------------------------ */

describe('checkAndIncrementGlobal', () => {
  it('allows the first call', async () => {
    const r = await checkAndIncrementGlobal();
    expect(r.allowed).toBe(true);
  });

  it('global cap is independent of per-IP cap', async () => {
    // Per-IP is maxed out
    const hash = 'ip-hash-ggg';
    for (let i = 0; i < 4; i++) {
      await checkAndIncrement(hash);
    }

    // Global should still work (they use different keys)
    const r = await checkAndIncrementGlobal();
    expect(r.allowed).toBe(true);
  });

  it('denies after 100 calls in the same window', async () => {
    for (let i = 0; i < 100; i++) {
      const r = await checkAndIncrementGlobal();
      expect(r.allowed).toBe(true);
    }
    const denied = await checkAndIncrementGlobal();
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  hashIp determinism                                                  */
/* ------------------------------------------------------------------ */

describe('hashIp', () => {
  it('returns the same hash for the same IP', () => {
    const ip = '192.168.1.1';
    expect(hashIp(ip)).toBe(hashIp(ip));
  });

  it('returns different hashes for different IPs', () => {
    expect(hashIp('192.168.1.1')).not.toBe(hashIp('10.0.0.1'));
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashIp('127.0.0.1');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
