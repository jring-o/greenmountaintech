/**
 * lib/adapters/html/hello-burlington-vt.ts -- HelloBurlingtonVT events HTML adapter.
 *
 * Scrapes event listings from https://helloburlingtonvt.com/events
 * using cheerio. The site is powered by Simpleview CMS with Vue.js
 * client-side rendering. Server-side HTML uses `.slide` cards with
 * `.slide-title`, `.slide-img`, and `.info-item` elements. Pagination
 * is controlled via `?page=N`. If a page returns no cards, pagination
 * stops.
 *
 * Implements the per-source HTML adapter contract from spec section 8.5.
 */

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { toUtc } from '@/lib/tz';

import type { Adapter, AdapterContext, AdapterEvent, Logger } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TZID = 'America/New_York';

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

const configSchema = z
  .object({
    pages: z.number().int().min(1).max(20).default(2),
  })
  .default({ pages: 2 });

/* ------------------------------------------------------------------ */
/*  Date / time parsing                                                */
/* ------------------------------------------------------------------ */

/**
 * Parse a date/time string from a HelloBurlingtonVT event card.
 *
 * Expected formats:
 *   "Sat, May 2, 2026 7:00 PM"
 *   "Fri, May 15, 2026"
 *   "May 2, 2026 7:00 PM"
 *   "May 2, 2026"
 *
 * Returns a wall-clock ISO string (no offset) or undefined if unparseable.
 */
function parseDateTimeString(raw: string): string | undefined {
  // Remove leading day-of-week (e.g. "Sat, " or "Friday, ")
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '').trim();

  // Try: "Month DD, YYYY H:MM AM/PM"
  const withTime = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

  // Try: "Month DD, YYYY"
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

/**
 * Extract the event slug from a HelloBurlingtonVT event URL.
 *
 * e.g. "https://helloburlingtonvt.com/event/burlington-jazz-weekend-2026/"
 *   => "burlington-jazz-weekend-2026"
 */
function extractExternalId(href: string): string | null {
  const match = href.match(/\/event\/([^/?#]+)/);
  if (!match) return null;
  return match[1]!.replace(/\/$/, '') || null;
}

/* ------------------------------------------------------------------ */
/*  Card parsing                                                       */
/* ------------------------------------------------------------------ */

type CheerioRoot = ReturnType<typeof cheerio.load>;
type CheerioSelection = ReturnType<CheerioRoot>;

type CardContext = {
  card: CheerioSelection;
  $root: CheerioRoot;
  page: number;
  index: number;
  log: Logger;
};

function findInfoItemText(
  card: CheerioSelection,
  $root: CheerioRoot,
  iconClass: string,
): string | undefined {
  let result: string | undefined;
  card.find('.info-item').each((_, el) => {
    const item = $root(el);
    if (item.find(`.${iconClass}`).length > 0) {
      result = item.find('span').text().trim() || undefined;
      return false; // break
    }
  });
  return result;
}

function parseCard(cc: CardContext): AdapterEvent | undefined {
  const { card, $root, page, index, log } = cc;

  const titleEl = card.find('.slide-title a').first();
  const title = titleEl.text().trim();
  if (!title) {
    log.debug('skipping card: missing title', { page, index });
    return undefined;
  }

  const rawHref = titleEl.attr('href') ?? '';
  const url = rawHref || undefined;
  const externalId = extractExternalId(rawHref);

  const dateText = findInfoItemText(card, $root, 'fa-calendar-week');
  if (!dateText) {
    log.debug('skipping card: missing date', { title, page, index });
    return undefined;
  }

  const localIso = parseDateTimeString(dateText);
  if (!localIso) {
    log.warn('skipping card: unparseable date', { title, dateText, page, index });
    return undefined;
  }

  const allDay = !/\d{1,2}:\d{2}\s*(AM|PM)/i.test(dateText);

  let startsAtUtc: Date;
  try {
    startsAtUtc = toUtc(localIso, TZID);
  } catch {
    log.warn('skipping card: toUtc failed', { title, localIso, page, index });
    return undefined;
  }

  return {
    externalId,
    title,
    description: card.find('.content-section > p').first().text().trim() || undefined,
    descriptionHtml: card.find('.content-section > p').first().html()?.trim() || undefined,
    startsAtUtc,
    tzid: TZID,
    allDay,
    venueName: findInfoItemText(card, $root, 'fa-map-marker-alt'),
    imageUrl: card.find('.slide-img').first().attr('src') ?? undefined,
    url,
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const helloBurlingtonVtAdapter: Adapter = {
  key: 'hello-burlington-vt',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;

    const cfg = configSchema.parse(source.adapter_config);

    for (let page = 1; page <= cfg.pages; page++) {
      const separator = source.url.includes('?') ? '&' : '?';
      const pageUrl = page === 1 ? source.url : `${source.url}${separator}page=${page}`;

      log.info('fetching listing page', { url: pageUrl, page });
      const res = await ctx.fetch(pageUrl);
      const html = await res.text();
      const $ = cheerio.load(html);

      const cards = $('.slide');

      if (cards.length === 0) {
        log.debug('no event cards found on page, stopping pagination', {
          page,
        });
        break;
      }

      for (let i = 0; i < cards.length; i++) {
        const event = parseCard({
          card: $(cards[i]!),
          $root: $,
          page,
          index: i,
          log,
        });
        if (event) yield event;
      }
    }
  },
};
