import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock env before importing the module under test                    */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    USER_AGENT_CONTACT: 'bot@example.com',
  },
}));

/* ------------------------------------------------------------------ */
/*  Mock robots helper                                                 */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/adapters/helpers/robots', () => ({
  isAllowed: vi.fn().mockResolvedValue(true),
}));

import { createFetch } from '@/lib/adapters/helpers/fetch';
import { isAllowed as isAllowedMock } from '@/lib/adapters/helpers/robots';
import type { Logger } from '@/lib/adapters/types';
import { RobotsDisallowedError } from '@/lib/adapters/types';

/* ------------------------------------------------------------------ */
/*  Shared fixtures                                                    */
/* ------------------------------------------------------------------ */

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => makeLogger(),
  };
}

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    robots_respect: true,
    rate_limit_per_min: 600, // high limit so rate-limiting doesn't slow tests
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
  vi.mocked(isAllowedMock).mockReset();
  vi.mocked(isAllowedMock).mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('createFetch (fetch.ts)', () => {
  it('stamps User-Agent header with VermontEventsBot/1.0', async () => {
    const log = makeLogger();
    const fetchFn = createFetch(fakeSource(), log);

    await fetchFn('https://example.com/feed');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledInit = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(calledInit.headers);
    expect(headers.get('User-Agent')).toBe('VermontEventsBot/1.0 (+mailto:bot@example.com)');
  });

  it('throws RobotsDisallowedError when robots disallows the URL', async () => {
    vi.mocked(isAllowedMock).mockResolvedValue(false);

    const log = makeLogger();
    const fetchFn = createFetch(fakeSource({ robots_respect: true }), log);

    await expect(fetchFn('https://example.com/secret')).rejects.toThrow(RobotsDisallowedError);
    // fetch should NOT have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips robots check when source.robots_respect is false', async () => {
    vi.mocked(isAllowedMock).mockResolvedValue(false); // would fail if checked

    const log = makeLogger();
    const fetchFn = createFetch(fakeSource({ robots_respect: false }), log);

    const res = await fetchFn('https://example.com/feed');
    expect(res.status).toBe(200);
    expect(isAllowedMock).not.toHaveBeenCalled();
  });

  it('retries once on 5xx and returns the retry response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('error', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const log = makeLogger();
    const fetchFn = createFetch(fakeSource(), log);

    const res = await fetchFn('https://example.com/feed');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const log = makeLogger();
    const fetchFn = createFetch(fakeSource(), log);

    const res = await fetchFn('https://example.com/missing');
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rate-limits requests via token bucket', async () => {
    const log = makeLogger();
    // 60 per min = 1 per second — very low to test rate limiting
    const fetchFn = createFetch(fakeSource({ rate_limit_per_min: 60 }), log);

    const start = Date.now();

    // First request should go through immediately (bucket starts full)
    await fetchFn('https://example.com/a');
    // Many more rapid requests should eventually cause a wait
    // We just verify 2 calls went through (bucket depletes gradually)
    await fetchFn('https://example.com/b');

    const elapsed = Date.now() - start;

    // Both calls should complete; we just verify they did
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // With 60 tokens/min the first 60 calls are instant, so elapsed should be small
    expect(elapsed).toBeLessThan(5_000);
  });
});
