import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';

import type { PublicEventItem } from '@/lib/db/queries/events-schema';
import { buildRss } from '@/lib/feeds/rss';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SITE_URL = 'https://example.com';

function parseRss(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  return parser.parse(xml);
}
function makeEventItem(overrides: Partial<PublicEventItem> = {}): PublicEventItem {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Community Barn Dance',
    startsAt: '2026-06-15T22:00:00.000Z',
    endsAt: '2026-06-16T01:00:00.000Z',
    tzid: 'America/New_York',
    allDay: false,
    venueName: 'Town Hall',
    region: 'central_vt',
    category: 'music',
    tags: ['folk', 'dance'],
    url: '/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceName: null,
    imageUrl: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('buildRss', () => {
  it('produces valid XML that round-trips through a parser', () => {
    const events = [makeEventItem()];
    const xml = buildRss(events, SITE_URL);

    expect(() => parseRss(xml)).not.toThrow();
  });

  it('has channel title "Vermont Events"', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    const parsed = parseRss(xml) as {
      rss: { channel: { title: string } };
    };
    expect(parsed.rss.channel.title).toBe('Vermont Events');
  });

  it('has channel description "Curated Vermont community events."', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    const parsed = parseRss(xml) as {
      rss: { channel: { description: string } };
    };
    expect(parsed.rss.channel.description).toBe('Curated Vermont community events.');
  });

  it('item count matches input events', () => {
    const events = [
      makeEventItem({ id: 'aaa-1', url: '/events/aaa-1' }),
      makeEventItem({ id: 'aaa-2', url: '/events/aaa-2' }),
      makeEventItem({ id: 'aaa-3', url: '/events/aaa-3' }),
    ];
    const xml = buildRss(events, SITE_URL);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'item',
    });
    const parsed = parser.parse(xml) as {
      rss: { channel: { item: unknown[] } };
    };
    expect(parsed.rss.channel.item).toHaveLength(3);
  });

  it('pubDate is a valid RFC 822 date string', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    const parsed = parseRss(xml) as {
      rss: { channel: { item: { pubDate: string } } };
    };
    const pubDate = parsed.rss.channel.item.pubDate;
    // RFC 822 dates are parseable by Date constructor
    const d = new Date(pubDate);
    expect(d.getTime()).not.toBeNaN();
  });

  it('contains guid with isPermaLink="true"', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    expect(xml).toContain('isPermaLink="true"');
  });

  it('contains atom:link self-reference', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    expect(xml).toContain('atom:link');
    expect(xml).toContain('rel="self"');
    expect(xml).toContain('type="application/rss+xml"');
  });

  it('item link is absolute URL', () => {
    const xml = buildRss([makeEventItem()], SITE_URL);
    expect(xml).toContain(
      '<link>https://example.com/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</link>',
    );
  });

  it('escapes XML special characters in title', () => {
    const xml = buildRss([makeEventItem({ title: 'Music & Drinks <Special>' })], SITE_URL);
    expect(xml).toContain('Music &amp; Drinks &lt;Special&gt;');
  });

  it('handles empty events array', () => {
    const xml = buildRss([], SITE_URL);
    expect(() => parseRss(xml)).not.toThrow();
    const parsed = parseRss(xml) as {
      rss: { channel: { title: string } };
    };
    expect(parsed.rss.channel.title).toBe('Vermont Events');
  });
});
