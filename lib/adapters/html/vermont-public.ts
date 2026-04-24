/**
 * lib/adapters/html/vermont-public.ts -- Vermont Public events calendar HTML adapter.
 *
 * Scrapes event listings from https://www.vermontpublic.org/vermont-events-calendar
 * using cheerio. Pagination is controlled via `?p=N`. Each event card uses
 * the `.PromoEvent` class with date, title, venue, time, category, and
 * description fields. Detail pages may be fetched for description HTML.
 *
 * Implements the per-source HTML adapter contract from spec section 8.5.
 */

import * as cheerio from 'cheerio';
import { z } from 'zod';

import { toUtc } from '@/lib/tz';

import type {
  Adapter,
  AdapterContext,
  AdapterEvent,
  EventCategory,
  FetchFn,
  Logger,
} from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TZID = 'America/New_York';

const BASE_URL = 'https://www.vermontpublic.org';

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

const configSchema = z
  .object({
    pages: z.number().int().min(1).max(20).default(2),
  })
  .default({ pages: 2 });

/* ------------------------------------------------------------------ */
/*  Category mapping                                                   */
/* ------------------------------------------------------------------ */

const CATEGORY_MAP: Record<string, EventCategory> = {
  music: 'music',
  'live music': 'music',
  concerts: 'music',
  film: 'film',
  movies: 'film',
  'theater & dance': 'arts_theater',
  theater: 'arts_theater',
  theatre: 'arts_theater',
  dance: 'arts_theater',
  arts: 'arts_theater',
  'art & museum exhibits': 'arts_theater',
  art: 'arts_theater',
  'food & drink': 'food_drink',
  food: 'food_drink',
  community: 'community_civic',
  civic: 'community_civic',
  'community events': 'community_civic',
  outdoor: 'outdoors_recreation',
  outdoors: 'outdoors_recreation',
  recreation: 'outdoors_recreation',
  'outdoor recreation': 'outdoors_recreation',
  sports: 'sports',
  family: 'family_kids',
  'family fun': 'family_kids',
  kids: 'family_kids',
  education: 'education_lecture',
  lectures: 'education_lecture',
  'talks & workshops': 'education_lecture',
  'farmers market': 'farmers_market',
  fundraiser: 'fundraiser',
  fundraisers: 'fundraiser',
};

function mapCategory(raw: string | undefined): EventCategory | undefined {
  if (!raw) return undefined;
  return CATEGORY_MAP[raw.trim().toLowerCase()];
}

/* ------------------------------------------------------------------ */
/*  Date / time parsing                                                */
/* ------------------------------------------------------------------ */

/**
 * Parse the time string from a Vermont Public event card.
 *
 * Expected formats:
 *   "07:00 PM - 11:00 PM on Sat, 17 May 2025"
 *   "10:00 AM - 09:00 PM on Sun, 18 May 2025"
 *   "09:00 AM - 02:00 PM, every Saturday through Oct 25, 2025"
 *   "09:00 AM - 05:00 PM, every day through May 01, 2026"
 *
 * Returns { startIso, endIso } wall-clock ISO strings (no offset) or undefined.
 */
function parseTimeString(
  raw: string,
  dateHint: { month: number; day: number; year: number },
): { startIso: string; endIso?: string } | undefined {
  // Extract start/end times: "HH:MM AM/PM - HH:MM AM/PM ..."
  const timeRangeMatch = raw.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
  );

  if (!timeRangeMatch) return undefined;

  const [, startHStr, startMStr, startAmpm, endHStr, endMStr, endAmpm] = timeRangeMatch;

  const startHour = to24Hour(parseInt(startHStr!, 10), startAmpm!);
  const startMin = parseInt(startMStr!, 10);
  const endHour = to24Hour(parseInt(endHStr!, 10), endAmpm!);
  const endMin = parseInt(endMStr!, 10);

  // Try to extract explicit date from "on Day, DD Mon YYYY"
  const explicitDateMatch = raw.match(/on\s+[A-Za-z]+,\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);

  let year: number;
  let month: number;
  let day: number;

  if (explicitDateMatch) {
    day = parseInt(explicitDateMatch[1]!, 10);
    const parsedMonth = parseMonth(explicitDateMatch[2]!);
    if (parsedMonth === undefined) return undefined;
    month = parsedMonth;
    year = parseInt(explicitDateMatch[3]!, 10);
  } else {
    // Fall back to the date from the PromoEvent-date-date element
    year = dateHint.year;
    month = dateHint.month;
    day = dateHint.day;
  }

  const datePart = `${year}-${pad(month)}-${pad(day)}`;
  const startIso = `${datePart}T${pad(startHour)}:${pad(startMin)}:00`;
  const endIso = `${datePart}T${pad(endHour)}:${pad(endMin)}:00`;

  return { startIso, endIso };
}

/**
 * Parse the date hint from the PromoEvent-date-date element text.
 *
 * Expected format: "May 17", "Apr 23"
 *
 * Returns { month, day } or undefined.
 */
function parseDateHint(
  dateText: string,
  currentYear: number,
): { month: number; day: number; year: number } | undefined {
  const match = dateText.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!match) return undefined;

  const month = parseMonth(match[1]!);
  if (month === undefined) return undefined;

  const day = parseInt(match[2]!, 10);

  return { month, day, year: currentYear };
}

function to24Hour(hour: number, ampm: string): number {
  if (ampm.toUpperCase() === 'PM' && hour !== 12) return hour + 12;
  if (ampm.toUpperCase() === 'AM' && hour === 12) return 0;
  return hour;
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
  // Vermont Public event URLs look like:
  // /vermont-events-calendar/event/burlington-jazz-weekend-05-01-2025-12-00-00
  const match = href.match(/\/event\/([^/?#]+)/);
  return match?.[1];
}

/* ------------------------------------------------------------------ */
/*  Card parsing helper                                                */
/* ------------------------------------------------------------------ */

type CheerioSelection = ReturnType<ReturnType<typeof cheerio.load>>;

type CardContext = {
  card: CheerioSelection;
  page: number;
  index: number;
  currentYear: number;
  log: Logger;
};

function parseCard(cc: CardContext):
  | (Omit<AdapterEvent, 'descriptionHtml'> & {
      descriptionHtml: string | undefined;
      fullUrl: string | undefined;
    })
  | undefined {
  const { card, page, index, currentYear, log } = cc;

  const title = card.find('h3 a').first().text().trim();
  if (!title) {
    log.debug('skipping card: missing title', { page, index });
    return undefined;
  }

  const rawHref = card.find('h3 a').first().attr('href') ?? '';
  const fullUrl = rawHref.startsWith('http')
    ? rawHref
    : rawHref
      ? `${BASE_URL}${rawHref}`
      : undefined;
  const externalId = extractExternalId(rawHref) || rawHref.split('/').filter(Boolean).pop() || null;

  const dateText = card.find('.PromoEvent-date-date').first().text().trim();
  if (!dateText) {
    log.debug('skipping card: missing date', { title, page, index });
    return undefined;
  }

  const dateHint = parseDateHint(dateText, currentYear);
  if (!dateHint) {
    log.warn('skipping card: unparseable date hint', { title, dateText, page, index });
    return undefined;
  }

  const timeText = card.find('.PromoEvent-time').first().text().trim();
  if (!timeText) {
    log.debug('skipping card: missing time', { title, page, index });
    return undefined;
  }

  const parsed = parseTimeString(timeText, dateHint);
  if (!parsed) {
    log.warn('skipping card: unparseable time', { title, timeText, page, index });
    return undefined;
  }

  let startsAtUtc: Date;
  try {
    startsAtUtc = toUtc(parsed.startIso, TZID);
  } catch {
    log.warn('skipping card: toUtc failed', { title, localIso: parsed.startIso, page, index });
    return undefined;
  }

  let endsAtUtc: Date | undefined;
  if (parsed.endIso) {
    try {
      endsAtUtc = toUtc(parsed.endIso, TZID);
    } catch {
      /* ignore */
    }
  }

  const venueName = card.find('.PromoEvent-venue').first().text().trim() || undefined;
  const categoryText = card.find('.PromoEvent-categories a').first().text().trim();
  const imageUrl = card.find('img').first().attr('src') ?? undefined;
  const descriptionHtml = card.find('.PromoEvent-description').first().html()?.trim() || undefined;

  return {
    externalId: externalId || null,
    title,
    descriptionHtml,
    startsAtUtc,
    endsAtUtc,
    tzid: TZID,
    venueName,
    category: mapCategory(categoryText),
    imageUrl,
    url: fullUrl,
    fullUrl,
  };
}

/* ------------------------------------------------------------------ */
/*  Detail page fetching helper                                        */
/* ------------------------------------------------------------------ */

async function fetchDetailDescription(
  url: string,
  fetchFn: FetchFn,
  log: Logger,
): Promise<string | undefined> {
  try {
    log.debug('fetching detail page', { url });
    const res = await fetchFn(url);
    const html = await res.text();
    const $ = cheerio.load(html);
    return $('.EventDetail-description').first().html()?.trim() || undefined;
  } catch {
    log.debug('failed to fetch detail page', { url });
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const vermontPublicAdapter: Adapter = {
  key: 'vermont-public',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;
    const cfg = configSchema.parse(source.adapter_config);
    const currentYear = ctx.now().getFullYear();

    for (let page = 1; page <= cfg.pages; page++) {
      const separator = source.url.includes('?') ? '&' : '?';
      const pageUrl = page === 1 ? source.url : `${source.url}${separator}p=${page}`;

      log.info('fetching listing page', { url: pageUrl, page });
      const res = await ctx.fetch(pageUrl);
      const html = await res.text();
      const $ = cheerio.load(html);
      const cards = $('.PromoEvent');

      if (cards.length === 0) {
        log.debug('no event cards found on page, stopping pagination', { page });
        break;
      }

      for (let i = 0; i < cards.length; i++) {
        const result = parseCard({ card: $(cards[i]!), page, index: i, currentYear, log });
        if (!result) continue;

        const { fullUrl, ...event } = result;
        let { descriptionHtml } = event;

        if (!descriptionHtml && fullUrl) {
          descriptionHtml = await fetchDetailDescription(fullUrl, ctx.fetch, log);
        }

        yield { ...event, descriptionHtml };
      }
    }
  },
};
