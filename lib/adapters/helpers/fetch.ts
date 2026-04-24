import { env } from '@/lib/env';

import type { FetchFn, Logger } from '../types';
import { RobotsDisallowedError } from '../types';

import { getLastRobotsFetch, isAllowed } from './robots';

/* ------------------------------------------------------------------ */
/*  User-Agent                                                         */
/* ------------------------------------------------------------------ */

function buildUserAgent(): string {
  return `VermontEventsBot/1.0 (+mailto:${env.USER_AGENT_CONTACT})`;
}

/* ------------------------------------------------------------------ */
/*  Token bucket – per source rate limiting                            */
/* ------------------------------------------------------------------ */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  ratePerMs: number;
  max: number;
}

function createBucket(ratePerMin: number): TokenBucket {
  return {
    tokens: ratePerMin,
    lastRefill: Date.now(),
    ratePerMs: ratePerMin / 60_000,
    max: ratePerMin,
  };
}

function refill(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(bucket.max, bucket.tokens + elapsed * bucket.ratePerMs);
  bucket.lastRefill = now;
}

async function acquire(bucket: TokenBucket): Promise<void> {
  refill(bucket);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return;
  }
  // Wait until one token is available
  const waitMs = Math.ceil((1 - bucket.tokens) / bucket.ratePerMs);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  refill(bucket);
  bucket.tokens -= 1;
}

/* ------------------------------------------------------------------ */
/*  Retry helpers                                                      */
/* ------------------------------------------------------------------ */

const RETRY_DELAY_MS = 2_000;
const MAX_RETRIES = 1;

function isRetryable(error: unknown): boolean {
  // Network errors (TypeError from fetch) are retryable
  return error instanceof TypeError;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

/* ------------------------------------------------------------------ */
/*  createFetch                                                        */
/* ------------------------------------------------------------------ */

/**
 * Creates a `FetchFn` scoped to a specific source.
 *
 * The returned function:
 * - Stamps `User-Agent: VermontEventsBot/1.0 (+mailto:…)`
 * - Checks robots.txt (unless `source.robots_respect` is false)
 * - Applies per-source token-bucket rate limiting
 * - Sets a 20s timeout via `AbortSignal.timeout(20_000)`
 * - Retries once on network error or 5xx after 2s; never retries 4xx
 */
export function createFetch(
  source: { robots_respect: boolean; rate_limit_per_min: number },
  log: Logger,
): FetchFn {
  const bucket = createBucket(source.rate_limit_per_min);
  const ua = buildUserAgent();

  return async (url: string, init?: RequestInit): Promise<Response> => {
    // 1. Robots check
    if (source.robots_respect) {
      const allowed = await isAllowed(url, 'VermontEventsBot', log);
      if (!allowed) {
        const last = getLastRobotsFetch(url);
        const diag = last
          ? `status=${last.status} bodyLen=${last.bodyLen} preview=${JSON.stringify(last.bodyPreview)}${last.fetchError ? ` fetchError=${last.fetchError}` : ''}`
          : 'no fetch diagnostics (cache hit before instrumentation)';
        log.warn('robots.txt disallows URL', { url, diag });
        throw new RobotsDisallowedError(`${url} (${diag})`);
      }
    }

    // 2. Rate limiting
    await acquire(bucket);

    // 3. Build request options
    const headers = new Headers(init?.headers);
    headers.set('User-Agent', ua);

    const fetchInit: RequestInit = {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    };

    // 4. Execute with retry
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, fetchInit);

        if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
          log.warn('retrying on 5xx', {
            url,
            status: res.status,
            attempt: attempt + 1,
          });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        return res;
      } catch (error: unknown) {
        lastError = error;

        if (isRetryable(error) && attempt < MAX_RETRIES) {
          log.warn('retrying on network error', {
            url,
            error: error instanceof Error ? error.message : String(error),
            attempt: attempt + 1,
          });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        throw error;
      }
    }

    // Should not reach here, but satisfy TypeScript
    throw lastError;
  };
}
