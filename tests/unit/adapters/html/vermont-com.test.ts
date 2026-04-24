import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { vermontComAdapter } from '@/lib/adapters/html/vermont-com';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { toZoned } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const LISTING_FIXTURE = fs.readFileSync(
  path.resolve(__dirname, '../../../fixtures/vermont-com/listing-page-1.html'),
  'utf-8',
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    name: 'Vermont.com Calendar',
    slug: 'vermont-com',
    kind: 'whitelist' as const,
    adapter_type: 'html' as const,
    adapter_key: 'vermont-com',
    url: 'https://vermont.com/calendar/',
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

function buildMockFetch() {
  return vi.fn().mockImplementation(() => {
    return Promise.resolve({
      text: () => Promise.resolve(LISTING_FIXTURE),
    });
  });
}

function buildCtx(overrides: Record<string, unknown> = {}): AdapterContext {
  return {
    source: fakeSource(overrides) as AdapterContext['source'],
    log: noopLogger,
    fetch: buildMockFetch(),
    now: () => new Date('2026-05-01T12:00:00Z'),
  };
}

async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of vermontComAdapter.ingest(ctx)) {
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

describe('vermont-com html adapter', () => {
  describe('adapter metadata', () => {
    it('has key "vermont-com"', () => {
      expect(vermontComAdapter.key).toBe('vermont-com');
    });

    it('exposes a configSchema', () => {
      expect(vermontComAdapter.configSchema).toBeDefined();
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

    it('parses the Burlington Jazz Festival event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-festival-2026');
      expect(jazz).toBeDefined();
      expect(jazz!.title).toBe('Burlington Jazz Festival');
      expect(jazz!.venueName).toBe('Burlington');
      expect(jazz!.url).toContain('/calendar/burlington-jazz-festival-2026');
      expect(jazz!.descriptionHtml).toContain('jazz celebration');
    });

    it('parses the wine pairing event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const wine = events.find(
        (e) => e.externalId === 'from-the-vine-to-vermont-a-curated-pairing-experience',
      );
      expect(wine).toBeDefined();
      expect(wine!.title).toBe('From the Vine to Vermont: A Curated Pairing Experience');
      expect(wine!.venueName).toBe('Landgrove');
    });

    it('parses the camp event correctly', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const camp = events.find(
        (e) => e.externalId === 'camp-for-free-weekend-see-thousands-of-daffodils',
      );
      expect(camp).toBeDefined();
      expect(camp!.title).toBe('Camp for FREE Weekend - See Thousands of Daffodils!');
      expect(camp!.venueName).toBe('Fairlee');
    });

    it('parses image URLs', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-festival-2026');
      expect(jazz).toBeDefined();
      expect(jazz!.imageUrl).toContain('jazz-fest.jpg');
    });

    it('sets allDay to true for all events (no time on listing cards)', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      for (const event of events) {
        expect(event.allDay).toBe(true);
      }
    });
  });

  describe('UTC round-trip', () => {
    it('Burlington Jazz Festival startsAtUtc round-trips to expected ET local date', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const jazz = events.find((e) => e.externalId === 'burlington-jazz-festival-2026');
      expect(jazz).toBeDefined();

      // "Saturday, 5/2 2026" at midnight ET (EDT, UTC-4) = 04:00 UTC
      expect(jazz!.startsAtUtc.toISOString()).toBe('2026-05-02T04:00:00.000Z');

      // Round-trip back to ET local time
      const local = toZoned(jazz!.startsAtUtc, 'America/New_York');
      expect(local.getHours()).toBe(0); // midnight
      expect(local.getMinutes()).toBe(0);
      expect(local.getMonth()).toBe(4); // May (0-indexed)
      expect(local.getDate()).toBe(2);
    });
  });

  describe('skipping invalid cards', () => {
    it('skips cards without a title', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // No event should have an empty title
      for (const event of events) {
        expect(event.title.length).toBeGreaterThan(0);
      }
    });

    it('skips cards without a date', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const mystery = events.find((e) => e.title === 'Mystery Event With No Date');
      expect(mystery).toBeUndefined();
    });

    it('yields exactly 5 valid events from the 7-card fixture', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      // 7 cards total, 2 invalid (no title, no date) = 5 valid
      expect(events).toHaveLength(5);
    });
  });

  describe('pagination config', () => {
    it('defaults pages to 2 when not specified', () => {
      const parsed = vermontComAdapter.configSchema!.parse({});
      expect(parsed).toEqual({ pages: 2 });
    });

    it('accepts custom page count', () => {
      const parsed = vermontComAdapter.configSchema!.parse({ pages: 5 });
      expect(parsed).toEqual({ pages: 5 });
    });

    it('rejects pages > 20', () => {
      expect(() => vermontComAdapter.configSchema!.parse({ pages: 25 })).toThrow();
    });

    it('rejects pages < 1', () => {
      expect(() => vermontComAdapter.configSchema!.parse({ pages: 0 })).toThrow();
    });

    it('accepts undefined config (outer default)', () => {
      // The outer .default({}) means undefined becomes {}, which is a valid input
      expect(() => vermontComAdapter.configSchema!.parse(undefined)).not.toThrow();
    });
  });
});
