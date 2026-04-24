import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isAllowed } from '@/lib/adapters/helpers/robots';
import { rssAdapter } from '@/lib/adapters/rss';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { RobotsDisallowedError } from '@/lib/adapters/types';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/adapters/helpers/robots', () => ({
  isAllowed: vi.fn().mockResolvedValue(true),
}));

const { mockParseURL } = vi.hoisted(() => {
  const mockParseURL = vi.fn();
  return { mockParseURL };
});

vi.mock('rss-parser', () => {
  class MockParser {
    parseURL = mockParseURL;
  }
  return { default: MockParser };
});

/* ------------------------------------------------------------------ */
/*  Fixture data                                                       */
/* ------------------------------------------------------------------ */

const FIXTURE_ITEMS = [
  {
    title: 'Burlington Jazz Festival',
    link: 'https://example.com/events/jazz-fest',
    guid: 'rss-item-001',
    pubDate: 'Wed, 14 May 2025 19:00:00 -0400',
    isoDate: '2025-05-14T23:00:00.000Z',
    content: '<p>Annual jazz festival at Waterfront Park.</p>',
    contentSnippet: 'Annual jazz festival at Waterfront Park.',
  },
  {
    title: 'Community Gathering',
    link: 'https://example.com/events/community',
    content: '<p>A great community event with no specific date mentioned.</p>',
    contentSnippet: 'A great community event with no specific date mentioned.',
  },
  {
    title: 'Farmers Market Opening',
    link: 'https://example.com/events/farmers-market',
    content: '<p>Join us May 14 at 7pm for the opening of the farmers market season.</p>',
    contentSnippet: 'Join us May 14 at 7pm for the opening of the farmers market season.',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Test RSS Source',
    slug: 'test-rss',
    kind: 'whitelist' as const,
    adapter_type: 'rss' as const,
    adapter_key: 'generic',
    url: 'https://example.com/feed.xml',
    adapter_config: {},
    trust_level: 'review' as const,
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: true,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    ...overrides,
  };
}

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => noopLogger,
};

function buildCtx(overrides: Record<string, unknown> = {}): AdapterContext {
  return {
    source: fakeSource(overrides) as AdapterContext['source'],
    log: noopLogger,
    fetch: vi.fn(),
    now: () => new Date('2025-01-15T12:00:00Z'),
  };
}

async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of rssAdapter.ingest(ctx)) {
    events.push(event);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAllowed).mockResolvedValue(true);
  mockParseURL.mockResolvedValue({
    items: FIXTURE_ITEMS,
    title: 'Vermont Events RSS Feed',
    link: 'https://example.com/events',
    description: 'Test RSS feed for Vermont events',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('rss adapter', () => {
  describe('useItemDateAsStart=true', () => {
    it('yields AdapterEvent with startsAtUtc from pubDate', async () => {
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      const jazzFest = events.find((e) => e.externalId === 'rss-item-001');
      expect(jazzFest).toBeDefined();
      expect(jazzFest!.title).toBe('Burlington Jazz Festival');
      expect(jazzFest!.startsAtUtc.toISOString()).toBe('2025-05-14T23:00:00.000Z');
    });

    it('skips items without pubDate even when useItemDateAsStart=true', async () => {
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      const community = events.find((e) => e.title === 'Community Gathering');
      expect(community).toBeUndefined();
    });
  });

  describe('both flags false (default config)', () => {
    it('skips all items and logs warning', async () => {
      const ctx = buildCtx({ adapter_config: {} });
      const events = await collectEvents(ctx);
      expect(events).toHaveLength(0);
      expect(noopLogger.warn).toHaveBeenCalledWith(
        'skipping RSS item: useItemDateAsStart=false and parseDatesFromBody=false',
        expect.objectContaining({ title: 'Burlington Jazz Festival' }),
      );
    });
  });

  describe('parseDatesFromBody=true', () => {
    it('extracts date from body text using chrono-node', async () => {
      const ctx = buildCtx({ adapter_config: { parseDatesFromBody: true } });
      const events = await collectEvents(ctx);
      const farmersMarket = events.find((e) => e.title === 'Farmers Market Opening');
      expect(farmersMarket).toBeDefined();
      expect(farmersMarket!.startsAtUtc).toBeInstanceOf(Date);
      const iso = farmersMarket!.startsAtUtc.toISOString();
      expect(iso).toMatch(/^\d{4}-05-14T23:00:00\.000Z$/);
      expect(farmersMarket!.startsAtUtc.getUTCMonth()).toBe(4);
      expect(farmersMarket!.startsAtUtc.getUTCDate()).toBe(14);
      expect(farmersMarket!.startsAtUtc.getUTCHours()).toBe(23);
    });

    it('skips items with no parseable date in body and warns', async () => {
      const ctx = buildCtx({ adapter_config: { parseDatesFromBody: true } });
      const events = await collectEvents(ctx);
      const community = events.find((e) => e.title === 'Community Gathering');
      expect(community).toBeUndefined();
      expect(noopLogger.warn).toHaveBeenCalledWith(
        'skipping RSS item: parseDatesFromBody found no date',
        expect.objectContaining({ title: 'Community Gathering' }),
      );
    });
  });

  describe('externalId fallback', () => {
    it('uses guid as externalId when present', async () => {
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      const jazzFest = events.find((e) => e.externalId === 'rss-item-001');
      expect(jazzFest).toBeDefined();
    });

    it('falls back to link when guid is absent', async () => {
      const ctx = buildCtx({ adapter_config: { parseDatesFromBody: true } });
      const events = await collectEvents(ctx);
      const farmersMarket = events.find((e) => e.title === 'Farmers Market Opening');
      expect(farmersMarket).toBeDefined();
      expect(farmersMarket!.externalId).toBe('https://example.com/events/farmers-market');
    });
  });

  describe('tzid default', () => {
    it('defaults to America/New_York when not specified in config', async () => {
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      const jazzFest = events.find((e) => e.externalId === 'rss-item-001');
      expect(jazzFest).toBeDefined();
      expect(jazzFest!.tzid).toBe('America/New_York');
    });

    it('uses custom tzid when specified', async () => {
      const ctx = buildCtx({
        adapter_config: { useItemDateAsStart: true, tzid: 'America/Chicago' },
      });
      const events = await collectEvents(ctx);
      const jazzFest = events.find((e) => e.externalId === 'rss-item-001');
      expect(jazzFest).toBeDefined();
      expect(jazzFest!.tzid).toBe('America/Chicago');
    });
  });

  describe('robots.txt enforcement', () => {
    it('throws RobotsDisallowedError when isAllowed returns false', async () => {
      vi.mocked(isAllowed).mockResolvedValue(false);
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      await expect(collectEvents(ctx)).rejects.toThrow(RobotsDisallowedError);
    });

    it('RobotsDisallowedError includes the source URL', async () => {
      vi.mocked(isAllowed).mockResolvedValue(false);
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      await expect(collectEvents(ctx)).rejects.toThrow('https://example.com/feed.xml');
    });
  });

  describe('skip items without title', () => {
    it('skips items that have no title and logs debug', async () => {
      mockParseURL.mockResolvedValue({
        items: [
          {
            link: 'https://example.com/events/no-title',
            guid: 'no-title-001',
            pubDate: 'Wed, 14 May 2025 19:00:00 -0400',
            content: '<p>Some content</p>',
            contentSnippet: 'Some content',
          },
          {
            title: 'Valid Event',
            link: 'https://example.com/events/valid',
            guid: 'valid-001',
            pubDate: 'Wed, 14 May 2025 20:00:00 -0400',
            content: '<p>Valid event content</p>',
            contentSnippet: 'Valid event content',
          },
        ],
        title: 'Test Feed',
        link: 'https://example.com',
        description: 'Test',
      });
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      expect(events).toHaveLength(1);
      expect(events[0]!.title).toBe('Valid Event');
      expect(noopLogger.debug).toHaveBeenCalledWith(
        'skipping RSS item: missing title',
        expect.objectContaining({ guid: 'no-title-001' }),
      );
    });
  });

  describe('yielded event field completeness', () => {
    it('populates description, descriptionHtml, and url from RSS item', async () => {
      const ctx = buildCtx({ adapter_config: { useItemDateAsStart: true } });
      const events = await collectEvents(ctx);
      const jazzFest = events.find((e) => e.externalId === 'rss-item-001');
      expect(jazzFest).toBeDefined();
      expect(jazzFest!.description).toBe('Annual jazz festival at Waterfront Park.');
      expect(jazzFest!.descriptionHtml).toBe('<p>Annual jazz festival at Waterfront Park.</p>');
      expect(jazzFest!.url).toBe('https://example.com/events/jazz-fest');
    });
  });
});
