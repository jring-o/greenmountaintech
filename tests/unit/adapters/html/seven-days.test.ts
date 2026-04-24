import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { sevenDaysAdapter } from '@/lib/adapters/html/seven-days';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { toZoned } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const LISTING_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/seven-days/listing-page-1.html'),
  'utf-8',
);

const DETAIL_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/seven-days/event-detail-1.html'),
  'utf-8',
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000007',
    name: 'Seven Days',
    slug: 'seven-days',
    kind: 'whitelist' as const,
    adapter_type: 'html' as const,
    adapter_key: 'seven-days',
    url: 'https://community.sevendaysvt.com/vermont/EventSearch',
    adapter_config: { pages: 1 },
    trust_level: 'auto_publish' as const,
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

/**
 * Build a mock ctx.fetch that returns the listing fixture for any URL
 * containing "EventSearch" and the detail fixture for detail URLs.
 */
function buildMockFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('EventSearch')) {
      return Promise.resolve({
        text: () => Promise.resolve(LISTING_FIXTURE),
      });
    }
    // Detail page
    return Promise.resolve({
      text: () => Promise.resolve(DETAIL_FIXTURE),
    });
  });
}

function buildCtx(overrides: Record<string, unknown> = {}): AdapterContext {
  return {
    source: fakeSource(overrides) as AdapterContext['source'],
    log: noopLogger,
    fetch: buildMockFetch(),
    now: () => new Date('2025-05-01T12:00:00Z'),
  };
}

async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of sevenDaysAdapter.ingest(ctx)) {
    events.push(event);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('seven-days html adapter', () => {
  describe('adapter metadata', () => {
    it('has key "seven-days"', () => {
      expect(sevenDaysAdapter.key).toBe('seven-days');
    });

    it('exposes a configSchema', () => {
      expect(sevenDaysAdapter.configSchema).toBeDefined();
    });
  });

  describe('listing page parsing', () => {
    it('yields at least 3 AdapterEvents for the fixture page', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('each event has title, startsAtUtc (Date), tzid="America/New_York", externalId (non-empty)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.title).toBeTruthy();
        expect(event.startsAtUtc).toBeInstanceOf(Date);
        expect(event.tzid).toBe('America/New_York');
        expect(event.externalId).toBeTruthy();
      }
    });

    it('parses the Jazz Festival event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === '98765');
      expect(jazz).toBeDefined();
      expect(jazz!.title).toBe('Burlington Jazz Festival');
      expect(jazz!.venueName).toBe('Waterfront Park');
      expect(jazz!.venueAddress).toBe('100 Lake Street, Burlington, VT 05401');
      expect(jazz!.category).toBe('music');
      expect(jazz!.imageUrl).toBe('https://community.sevendaysvt.com/images/jazz-fest-2025.jpg');
      expect(jazz!.url).toContain('/vermont/Events/Details/98765/');
    });

    it('parses event with end time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === '98765');
      expect(jazz).toBeDefined();
      expect(jazz!.endsAtUtc).toBeInstanceOf(Date);
      // 11:00 PM ET on May 17 2025 = 03:00 UTC on May 18
      expect(jazz!.endsAtUtc!.toISOString()).toBe('2025-05-18T03:00:00.000Z');
    });

    it('parses event with date-only (no time) as midnight local', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const studio = events.find((e) => e.externalId === '76543');
      expect(studio).toBeDefined();
      expect(studio!.title).toBe('Open Studio Weekend');
      // Midnight EDT on May 17 2025 = 04:00 UTC
      expect(studio!.startsAtUtc.toISOString()).toBe('2025-05-17T04:00:00.000Z');
    });

    it('maps category "Arts" to "arts_theater"', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const studio = events.find((e) => e.externalId === '76543');
      expect(studio).toBeDefined();
      expect(studio!.category).toBe('arts_theater');
    });

    it('maps category "Farmers Market" to "farmers_market"', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const market = events.find((e) => e.externalId === '87654');
      expect(market).toBeDefined();
      expect(market!.category).toBe('farmers_market');
    });
  });

  describe('UTC round-trip', () => {
    it('Jazz Festival startsAtUtc round-trips to expected ET local time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === '98765');
      expect(jazz).toBeDefined();

      // 7:00 PM EDT on May 17 2025 = 23:00 UTC on May 17
      expect(jazz!.startsAtUtc.toISOString()).toBe('2025-05-17T23:00:00.000Z');

      // Round-trip back to ET local time
      const local = toZoned(jazz!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(19); // 7 PM
      expect(local.getMinutes()).toBe(0);
      expect(local.getMonth()).toBe(4); // May (0-indexed)
      expect(local.getDate()).toBe(17);
    });
  });

  describe('skipping invalid cards', () => {
    it('skips cards without a date', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const tba = events.find((e) => e.title === 'TBA Community Event');
      expect(tba).toBeUndefined();
      expect(noopLogger.debug).toHaveBeenCalledWith(
        'skipping card: missing date',
        expect.objectContaining({ title: 'TBA Community Event' }),
      );
    });

    it('skips cards without a title', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // Fixture has 5 cards, 2 should be skipped (no date, no title)
      // So exactly 3 valid events
      expect(events).toHaveLength(3);
    });
  });

  describe('detail page fetching', () => {
    it('fetches detail page when listing card lacks description', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const market = events.find((e) => e.externalId === '87654');
      expect(market).toBeDefined();
      // Detail page provides descriptionHtml
      expect(market!.descriptionHtml).toContain("Vermont's premier farmers market");
    });

    it('does not fetch detail page when listing card has description', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === '98765');
      expect(jazz).toBeDefined();
      expect(jazz!.descriptionHtml).toContain('jazz festival');

      // ctx.fetch should have been called for listing (1) + detail for market (1) + detail for studio (1)
      // but NOT for jazz (which has inline description)
      const fetchCalls = vi.mocked(ctx.fetch).mock.calls;
      const detailCalls = fetchCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('98765'),
      );
      expect(detailCalls).toHaveLength(0);
    });
  });

  describe('pagination config', () => {
    it('defaults pages to 3 when not specified', () => {
      const parsed = sevenDaysAdapter.configSchema!.parse({});
      expect(parsed).toEqual({ pages: 3 });
    });

    it('accepts custom page count', () => {
      const parsed = sevenDaysAdapter.configSchema!.parse({ pages: 5 });
      expect(parsed).toEqual({ pages: 5 });
    });

    it('rejects pages > 20', () => {
      expect(() => sevenDaysAdapter.configSchema!.parse({ pages: 25 })).toThrow();
    });

    it('rejects pages < 1', () => {
      expect(() => sevenDaysAdapter.configSchema!.parse({ pages: 0 })).toThrow();
    });
  });
});
