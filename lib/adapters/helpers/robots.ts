import robotsParser from 'robots-parser';

import type { Logger } from '../types';

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

async function fetchRobotsTxt(host: string, log?: Logger): Promise<CacheEntry> {
  const robotsUrl = `https://${host}/robots.txt`;
  let body = '';
  let status = 0;
  let fetchError: string | undefined;

  try {
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': DEFAULT_UA },
    });
    status = res.status;
    if (res.ok) {
      body = await res.text();
    }
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  log?.warn('robots fetched', {
    robotsUrl,
    status,
    bodyLen: body.length,
    bodyPreview: body.slice(0, 300),
    fetchError,
  });
  lastFetchByHost.set(host, {
    status,
    bodyLen: body.length,
    bodyPreview: body.slice(0, 300),
    ...(fetchError !== undefined ? { fetchError } : {}),
  });

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
interface LastFetch {
  status: number;
  bodyLen: number;
  bodyPreview: string;
  fetchError?: string;
}

const lastFetchByHost = new Map<string, LastFetch>();

export async function isAllowed(
  url: string,
  ua: string = DEFAULT_UA,
  log?: Logger,
): Promise<boolean> {
  const host = new URL(url).host;

  let entry = cache.get(host);
  if (!entry || Date.now() >= entry.expiresAt) {
    entry = await fetchRobotsTxt(host, log);
  }

  const verdict = entry.robot.isAllowed(url, ua);
  log?.warn('robots verdict', { url, ua, verdict });
  return verdict !== false;
}

/**
 * Returns diagnostics from the most recent robots.txt fetch for the
 * URL's host (or undefined if the host's robots.txt has not yet been
 * fetched in this process). Use to enrich error messages when
 * isAllowed() returned false.
 */
export function getLastRobotsFetch(url: string): LastFetch | undefined {
  return lastFetchByHost.get(new URL(url).host);
}

/** @internal – exposed for unit tests to reset between runs. */
export function _clearCache(): void {
  cache.clear();
}
