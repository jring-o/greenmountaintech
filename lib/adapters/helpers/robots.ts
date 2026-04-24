import robotsParser from 'robots-parser';

const DEFAULT_UA = 'VermontEventsBot';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 256;

/* ------------------------------------------------------------------ */
/*  LRU cache: host -> { robot, expiresAt }                           */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  robot: ReturnType<typeof robotsParser>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Evict the oldest entry when the cache exceeds MAX_CACHE_SIZE. */
function evictOldest(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Map iteration order is insertion order; delete the first key.
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) {
    cache.delete(firstKey);
  }
}

/* ------------------------------------------------------------------ */
/*  fetchRobotsTxt                                                     */
/* ------------------------------------------------------------------ */

async function fetchRobotsTxt(host: string): Promise<CacheEntry> {
  const robotsUrl = `https://${host}/robots.txt`;
  let body = '';

  try {
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': DEFAULT_UA },
    });
    if (res.ok) {
      body = await res.text();
    }
    // On 4xx/5xx we treat as "no robots.txt" → allow everything
  } catch {
    // Network error → allow everything
  }

  const robot = robotsParser(robotsUrl, body);
  const entry: CacheEntry = {
    robot,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  cache.set(host, entry);
  evictOldest();

  return entry;
}

/* ------------------------------------------------------------------ */
/*  isAllowed                                                          */
/* ------------------------------------------------------------------ */

/**
 * Check whether `url` is allowed by the host's robots.txt for the
 * given user-agent (defaults to `VermontEventsBot`).
 *
 * Results are cached per host for 1 hour (LRU, max 256 hosts).
 */
export async function isAllowed(url: string, ua: string = DEFAULT_UA): Promise<boolean> {
  const host = new URL(url).host;

  let entry = cache.get(host);
  if (!entry || Date.now() >= entry.expiresAt) {
    entry = await fetchRobotsTxt(host);
  }

  return entry.robot.isAllowed(url, ua) !== false;
}

/** @internal – exposed for unit tests to reset between runs. */
export function _clearCache(): void {
  cache.clear();
}
