/**
 * lib/rate-limit.ts -- Per-IP and global submission rate limiting.
 *
 * Uses an in-memory LRU cache to short-circuit DB round-trips on the hot path
 * (already-denied IPs). Falls through to an atomic upsert against the
 * `submission_rate_limits` table for authoritative state.
 *
 * Per-IP cap: 3 submissions per rolling 1-hour window.
 * Global cap: 100 submissions per rolling 1-hour window (key: '__global__').
 */

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { submissionRateLimits } from '@/lib/db/schema';
import { log } from '@/lib/log';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PER_IP_CAP = 3;
const GLOBAL_CAP = 100;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GLOBAL_KEY = '__global__';

/* ------------------------------------------------------------------ */
/*  In-memory LRU cache                                                */
/* ------------------------------------------------------------------ */

type CacheEntry = {
  count: number;
  windowStart: number; // epoch ms
};

/**
 * Minimal LRU cache: Map preserves insertion order; on every get/set we
 * delete-then-re-insert to bump the key to the end. Eviction trims from
 * the front (oldest).
 */
class LRUCache {
  private map = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 1024) {
    this.maxSize = maxSize;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // bump to end
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, entry);
    // evict oldest if over capacity
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  /** Exposed for testing. */
  clear(): void {
    this.map.clear();
  }
}

export const lruCache = new LRUCache();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function retrySeconds(windowStart: number, now: number): number {
  return Math.max(Math.ceil((WINDOW_MS - (now - windowStart)) / 1000), 1);
}

async function upsertRateRow(key: string) {
  const rows = await db
    .insert(submissionRateLimits)
    .values({
      ip_hash: key,
      count_1h: 1,
      window_started_at: sql`now()`,
    })
    .onConflictDoUpdate({
      target: submissionRateLimits.ip_hash,
      set: {
        count_1h: sql`CASE
          WHEN ${submissionRateLimits.window_started_at} < now() - interval '1 hour'
          THEN 1
          ELSE ${submissionRateLimits.count_1h} + 1
        END`,
        window_started_at: sql`CASE
          WHEN ${submissionRateLimits.window_started_at} < now() - interval '1 hour'
          THEN now()
          ELSE ${submissionRateLimits.window_started_at}
        END`,
      },
    })
    .returning({
      count_1h: submissionRateLimits.count_1h,
      window_started_at: submissionRateLimits.window_started_at,
    });

  const row = rows[0]!;
  return {
    count: row.count_1h,
    windowStart: new Date(row.window_started_at).getTime(),
  };
}

/* ------------------------------------------------------------------ */
/*  Core logic                                                         */
/* ------------------------------------------------------------------ */

async function checkAndIncrementKey(
  key: string,
  cap: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();

  // -- Fast path: in-memory cache --
  const cached = lruCache.get(key);
  if (cached) {
    const elapsed = now - cached.windowStart;
    if (elapsed < WINDOW_MS && cached.count >= cap) {
      return { allowed: false, retryAfterSeconds: retrySeconds(cached.windowStart, now) };
    }
    if (elapsed >= WINDOW_MS) {
      lruCache.set(key, { count: 0, windowStart: now });
    }
  }

  // -- DB upsert (authoritative) --
  const { count, windowStart } = await upsertRateRow(key);
  lruCache.set(key, { count, windowStart });

  if (count > cap) {
    return { allowed: false, retryAfterSeconds: retrySeconds(windowStart, now) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Check and increment the per-IP submission rate limit.
 * Cap: 3 per rolling 1-hour window.
 */
export async function checkAndIncrement(
  ipHash: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return checkAndIncrementKey(ipHash, PER_IP_CAP);
}

/**
 * Check and increment the global submission rate limit.
 * Cap: 100 per rolling 1-hour window. Key: '__global__'.
 */
export async function checkAndIncrementGlobal(): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  const result = await checkAndIncrementKey(GLOBAL_KEY, GLOBAL_CAP);
  if (!result.allowed) {
    log.warn('Global submission rate limit exceeded', {
      cap: GLOBAL_CAP,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return result;
}
