import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _clearCache, isAllowed } from '@/lib/adapters/helpers/robots';

/* ------------------------------------------------------------------ */
/*  Mock global fetch                                                  */
/* ------------------------------------------------------------------ */

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  _clearCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  _clearCache();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function robotsTxtResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('isAllowed (robots.ts)', () => {
  it('returns true when robots.txt has no Disallow for the path', async () => {
    fetchMock.mockResolvedValueOnce(
      robotsTxtResponse(['User-agent: *', 'Disallow: /private/'].join('\n')),
    );

    const result = await isAllowed('https://example.com/events/feed.ics');
    expect(result).toBe(true);
  });

  it('returns false when robots.txt disallows the specific path', async () => {
    fetchMock.mockResolvedValueOnce(
      robotsTxtResponse(['User-agent: VermontEventsBot', 'Disallow: /events/'].join('\n')),
    );

    const result = await isAllowed('https://example.com/events/feed.ics', 'VermontEventsBot');
    expect(result).toBe(false);
  });

  it('caches the result so the same host is not fetched twice', async () => {
    fetchMock.mockResolvedValueOnce(robotsTxtResponse(['User-agent: *', 'Allow: /'].join('\n')));

    await isAllowed('https://example.com/a');
    await isAllowed('https://example.com/b');

    // fetch should have been called exactly once for robots.txt
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns true when robots.txt fetch fails (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network error'));

    const result = await isAllowed('https://broken.example.com/feed');
    expect(result).toBe(true);
  });

  it('returns true when robots.txt returns 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await isAllowed('https://norobots.example.com/feed');
    expect(result).toBe(true);
  });
});
