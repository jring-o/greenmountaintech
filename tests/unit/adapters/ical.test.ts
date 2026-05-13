import path from 'node:path';

import * as nodeIcal from 'node-ical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { icalAdapter } from '@/lib/adapters/ical';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/adapters/helpers/robots', () => ({
  isAllowed: vi.fn().mockResolvedValue(true),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/ical/synthetic.ics');

/** Minimal fake SourceRow for testing. */
function fakeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test iCal Source',
    slug: 'test-ical',
    kind: 'whitelist' as const,
    adapter_type: 'ical' as const,
    adapter_key: 'generic',
    url: 'https://example.com/cal.ics',
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

/** Collect all events from the async generator. */
async function collectEvents(ctx: AdapterContext): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of icalAdapter.ingest(ctx)) {
    events.push(event);
  }
  return events;
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                   */
/* ------------------------------------------------------------------ */

let parsedFixture: nodeIcal.CalendarResponse;

beforeEach(async () => {
  // Parse the fixture from disk once
  parsedFixture = nodeIcal.sync.parseFile(FIXTURE_PATH);

  // Mock node-ical.async.fromURL to return the parsed fixture
  vi.spyOn(nodeIcal.async, 'fromURL').mockResolvedValue(parsedFixture as nodeIcal.CalendarResponse);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Fixed "now" for deterministic RRULE expansion                      */
/* ------------------------------------------------------------------ */

const FIXED_NOW = new Date('2025-01-15T12:00:00Z');

function buildCtx(overrides: Record<string, unknown> = {}): AdapterContext {
  return {
    source: fakeSource(overrides) as AdapterContext['source'],
    log: noopLogger,
    fetch: vi.fn(),
    now: () => FIXED_NOW,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ical adapter', () => {
  // ── 1. Single-occurrence VEVENT yields one AdapterEvent with correct UTC ──
  describe('single-occurrence VEVENT', () => {
    it('yields one AdapterEvent with correct UTC time', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const single = events.find((e) => e.externalId === 'single-event-001');
      expect(single).toBeDefined();
      expect(single!.title).toBe('Vermont Winter Concert');
      expect(single!.venueName).toBe('Town Hall');
      // DTSTART 2025-02-20T19:00:00 EST = 2025-02-21T00:00:00Z
      expect(single!.startsAtUtc.toISOString()).toBe('2025-02-21T00:00:00.000Z');
      // DTEND 2025-02-20T21:00:00 EST = 2025-02-21T02:00:00Z
      expect(single!.endsAtUtc!.toISOString()).toBe('2025-02-21T02:00:00.000Z');
      expect(single!.tzid).toBe('America/New_York');
      expect(single!.allDay).toBeUndefined();
    });
  });

  // ── 2. All-day VEVENT yields allDay: true ──
  describe('all-day VEVENT', () => {
    it('yields allDay: true with correct date anchoring', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const allDay = events.find((e) => e.externalId === 'allday-event-001');
      expect(allDay).toBeDefined();
      expect(allDay!.title).toBe('Vermont Maple Syrup Day');
      expect(allDay!.allDay).toBe(true);
      // DATE 20250301 anchored to midnight EST = 2025-03-01T05:00:00Z
      expect(allDay!.startsAtUtc.toISOString()).toBe('2025-03-01T05:00:00.000Z');
    });
  });

  // ── 3. RRULE expansion with EXDATE filtering ──
  describe('RRULE expansion with EXDATE', () => {
    it('produces expected count after EXDATE filtering', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const weeklyEvents = events.filter((e) => e.externalId === 'weekly-rrule-001');
      // 6 occurrences from COUNT=6, minus 1 EXDATE (Feb 3) = 5
      expect(weeklyEvents).toHaveLength(5);
      // Verify the EXDATE date is not present
      const dates = weeklyEvents.map((e) => e.startsAtUtc.toISOString().slice(0, 10));
      expect(dates).not.toContain('2025-02-03');
    });
  });

  // ── 4. TZID re-anchor: EST pre-DST time converts correctly ──
  describe('TZID re-anchor', () => {
    it('correctly converts pre-DST America/New_York time to UTC', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const single = events.find((e) => e.externalId === 'single-event-001');
      expect(single).toBeDefined();
      // 2025-02-20T19:00:00 EST (UTC-5, pre-DST) = 2025-02-21T00:00:00Z
      expect(single!.startsAtUtc.toISOString()).toBe('2025-02-21T00:00:00.000Z');
      expect(single!.tzid).toBe('America/New_York');
    });
  });

  // ── 5. Missing UID/DTSTART/SUMMARY → VEVENT is skipped ──
  describe('skip invalid VEVENTs', () => {
    it('skips VEVENT with missing SUMMARY', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const missing = events.find((e) => e.externalId === 'missing-summary-001');
      expect(missing).toBeUndefined();
    });
  });

  // ── 6. URL fallback to first https?:// in DESCRIPTION ──
  describe('URL fallback', () => {
    it('extracts URL from DESCRIPTION when URL property absent', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const potluck = events.find((e) => e.externalId === 'no-url-event-001');
      expect(potluck).toBeDefined();
      expect(potluck!.url).toBe('https://example.com/potluck');
    });

    it('uses URL property from single-event description', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const concert = events.find((e) => e.externalId === 'single-event-001');
      expect(concert).toBeDefined();
      // single-event-001 has no URL property, but has https://... in description
      expect(concert!.url).toBe('https://example.com/concert');
    });
  });

  // ── 7. default_category from adapter_config ──
  describe('default_category config', () => {
    it('sets category on every yielded event when configured', async () => {
      const ctx = buildCtx({
        adapter_config: { default_category: 'tech' },
      });
      const events = await collectEvents(ctx);

      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.category).toBe('tech');
      }
    });
  });

  // ── Bonus: RRULE with recurrence override ──
  describe('RRULE with recurrence override', () => {
    it('uses override data for the overridden occurrence', async () => {
      const ctx = buildCtx();
      const events = await collectEvents(ctx);

      const bookClubEvents = events.filter((e) => e.externalId === 'rrule-override-001');
      // 4 occurrences from COUNT=4, no EXDATEs
      expect(bookClubEvents).toHaveLength(4);

      // Find the Feb 15 override
      const override = bookClubEvents.find(
        (e) => e.startsAtUtc.toISOString().slice(0, 10) === '2025-02-15',
      );
      expect(override).toBeDefined();
      expect(override!.title).toBe('Monthly Book Club (Rescheduled)');
      // Override: DTSTART 2025-02-15T14:00:00 EST = 2025-02-15T19:00:00Z
      expect(override!.startsAtUtc.toISOString()).toBe('2025-02-15T19:00:00.000Z');
    });
  });
});
