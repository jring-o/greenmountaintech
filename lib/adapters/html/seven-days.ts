/**
 * lib/adapters/html/seven-days.ts -- Seven Days community events HTML adapter.
 *
 * Scrapes event listings from https://community.sevendaysvt.com/vermont/EventSearch
 * using cheerio. Pagination is controlled via `?page=N`. Each event card is
 * parsed for title, date/time, venue, category, and image. Detail pages may be
 * fetched for description HTML.
 *
 * Implements the per-source HTML adapter contract from spec section 8.5.
 */

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { toUtc } from '@/lib/tz';

import type { Adapter, AdapterContext, AdapterEvent, EventCategory } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TZID = 'America/New_York';

const BASE_URL = 'https://community.sevendaysvt.com';

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

const configSchema = z
  .object({
    pages: z.number().int().min(1).max(20).default(3),
  })
  .default({ pages: 3 });

/* ------------------------------------------------------------------ */
/*  Category mapping                                                   */
/* ------------------------------------------------------------------ */

const CATEGORY_MAP: Record<string, EventCategory> = {
  music: 'music',
  'music+nightlife': 'music',
  nightlife: 'music',
  'live music': 'music',
  concerts: 'music',
  arts: 'arts_theater',
  'arts+entertainment': 'arts_theater',
  'arts & entertainment': 'arts_theater',
  theater: 'arts_theater',
  theatre: 'arts_theater',
  comedy: 'arts_theater',
  dance: 'arts_theater',
  food: 'food_drink',
  'food+drink': 'food_drink',
  'food & drink': 'food_drink',
  community: 'community_civic',
  'community events': 'community_civic',
  civic: 'community_civic',
  outdoor: 'outdoors_recreation',
  outdoors: 'outdoors_recreation',
  recreation: 'outdoors_recreation',
  sports: 'sports',
  family: 'family_kids',
  'family fun': 'family_kids',
  kids: 'family_kids',
  education: 'education_lecture',
  lectures: 'education_lecture',
  film: 'film',
  movies: 'film',
  'farmers market': 'farmers_market',
  fundraiser: 'fundraiser',
  fundraisers: 'fundraiser',
  bazaars: 'other',
};

function mapCategory(raw: string | undefined): EventCategory | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return CATEGORY_MAP[normalized] ?? undefined;
}

/* ------------------------------------------------------------------ */
/*  Date parsing                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a date/time string from a Seven Days event card.
 *
 * Expected formats:
 *   "Saturday, May 17, 2025, 7:00 PM"
 *   "Friday, May 16, 2025"
 *   "May 17, 2025, 7:00 PM"
 *   "May 17, 2025"
 *
 * Returns a wall-clock ISO string (no offset) or undefined if unparseable.
 */
function parseDateTimeString(raw: string): string | undefined {
  // Remove leading day-of-week (e.g. "Saturday, ")
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '').trim();

  // Try: "Month DD, YYYY, H:MM AM/PM" or "Month DD, YYYY"
  const withTime = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
  const dateOnly = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i;

  let match = cleaned.match(withTime);
  if (match) {
    const [, monthStr, dayStr, yearStr, hourStr, minStr, ampm] = match;
    const month = parseMonth(monthStr!);
    if (month === undefined) return undefined;

    let hour = parseInt(hourStr!, 10);
    if (ampm!.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (ampm!.toUpperCase() === 'AM' && hour === 12) hour = 0;

    return `${yearStr}-${pad(month)}-${pad(parseInt(dayStr!, 10))}` + `T${pad(hour)}:${minStr}:00`;
  }

  match = cleaned.match(dateOnly);
  if (match) {
    const [, monthStr, dayStr, yearStr] = match;
    const month = parseMonth(monthStr!);
    if (month === undefined) return undefined;

    return `${yearStr}-${pad(month)}-${pad(parseInt(dayStr!, 10))}T00:00:00`;
  }

  return undefined;
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseMonth(s: string): number | undefined {
  return MONTHS[s.toLowerCase()];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/*  Slug extraction                                                    */
/* ------------------------------------------------------------------ */

function extractExternalId(href: string): string | undefined {
  const match = href.match(/\/Details\/(\d+)/i);
  return match?.[1];
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const sevenDaysAdapter: Adapter = {
  key: 'seven-days',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;

    const cfg = configSchema.parse(source.adapter_config);

    for (let page = 1; page <= cfg.pages; page++) {
      const separator = source.url.includes('?') ? '&' : '?';
      const pageUrl = `${source.url}${separator}page=${page}`;

      log.info('fetching listing page', { url: pageUrl, page });
      const res = await ctx.fetch(pageUrl);
      const html = await res.text();
      const $ = cheerio.load(html);

      const cards = $('[data-type="event"], .event-card, .fsEventRow, .listing-item');

      if (cards.length === 0) {
        log.debug('no event cards found on page, stopping pagination', { page });
        break;
      }

      for (let i = 0; i < cards.length; i++) {
        const card = $(cards[i]!);

        // Title (required)
        const title = card
          .find('.event-title, .fsEventTitle, h2 a, h3 a, .listing-title a')
          .first()
          .text()
          .trim();

        if (!title) {
          log.debug('skipping card: missing title', { page, index: i });
          continue;
        }

        // Link / external ID
        const linkEl = card
          .find('.event-title a, .fsEventTitle a, h2 a, h3 a, .listing-title a')
          .first();
        const rawHref = linkEl.attr('href') ?? '';
        const fullUrl = rawHref.startsWith('http')
          ? rawHref
          : rawHref
            ? `${BASE_URL}${rawHref}`
            : undefined;
        const externalId =
          extractExternalId(rawHref) || rawHref.split('/').filter(Boolean).pop() || null;

        // Date / time (required -- skip card if absent)
        const dateText = card
          .find('.event-date, .fsEventDate, .listing-date, time')
          .first()
          .text()
          .trim();

        if (!dateText) {
          log.debug('skipping card: missing date', { title, page, index: i });
          continue;
        }

        const localIso = parseDateTimeString(dateText);
        if (!localIso) {
          log.warn('skipping card: unparseable date', {
            title,
            dateText,
            page,
            index: i,
          });
          continue;
        }

        let startsAtUtc: Date;
        try {
          startsAtUtc = toUtc(localIso, TZID);
        } catch {
          log.warn('skipping card: toUtc failed', {
            title,
            localIso,
            page,
            index: i,
          });
          continue;
        }

        // End time (optional)
        const endText = card
          .find('.event-end-date, .fsEventEndDate, .listing-end-date')
          .first()
          .text()
          .trim();
        let endsAtUtc: Date | undefined;
        if (endText) {
          const endIso = parseDateTimeString(endText);
          if (endIso) {
            try {
              endsAtUtc = toUtc(endIso, TZID);
            } catch {
              // Ignore unparseable end dates
            }
          }
        }

        // Venue
        const venueName =
          card.find('.event-venue, .fsEventVenue, .listing-venue').first().text().trim() ||
          undefined;

        const venueAddress =
          card.find('.event-address, .fsEventAddress, .listing-address').first().text().trim() ||
          undefined;

        // Category
        const categoryText = card
          .find('.event-category, .fsEventCategory, .listing-category')
          .first()
          .text()
          .trim();
        const category = mapCategory(categoryText);

        // Image
        const imageUrl = card.find('img').first().attr('src') ?? undefined;

        // Description from listing card
        const descriptionHtml =
          card
            .find('.event-description, .fsEventDescription, .listing-description')
            .first()
            .html()
            ?.trim() || undefined;

        // Optionally fetch detail page for description
        let detailDescription = descriptionHtml;
        if (!detailDescription && fullUrl) {
          try {
            log.debug('fetching detail page', { url: fullUrl });
            const detailRes = await ctx.fetch(fullUrl);
            const detailHtml = await detailRes.text();
            const $detail = cheerio.load(detailHtml);
            detailDescription =
              $detail('.event-detail-description, .fsEventDescription, .detail-description')
                .first()
                .html()
                ?.trim() || undefined;
          } catch {
            log.debug('failed to fetch detail page', { url: fullUrl });
          }
        }

        yield {
          externalId: externalId || null,
          title,
          descriptionHtml: detailDescription,
          startsAtUtc,
          endsAtUtc,
          tzid: TZID,
          venueName,
          venueAddress,
          category,
          imageUrl,
          url: fullUrl,
        };
      }
    }
  },
};
