/**
 * lib/adapters/html/vermont-com.ts -- Vermont.com calendar HTML adapter.
 *
 * Scrapes event listings from https://vermont.com/calendar/
 * using cheerio. The site uses WP Grid Builder; the initial page load
 * renders `.wpgb-card` cards with title, date, description, image,
 * location, and a link to the detail page. Pagination is AJAX-based,
 * so each "page" is fetched by appending `?_page=N` (WP Grid Builder
 * REST convention). If a page returns no cards, pagination stops.
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

const BASE_URL = 'https://vermont.com';

const DATE_PATTERN = /\d+\/\d+\s+\d{4}/;

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

const configSchema = z
  .object({
    pages: z.number().int().min(1).max(20).default(2),
  })
  .default({ pages: 2 });

/* ------------------------------------------------------------------ */
/*  Date parsing                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a date string from a Vermont.com event card.
 *
 * Expected format: "Saturday, 5/2 2026" or "Friday, 12/15 2025"
 *
 * Returns a wall-clock ISO string (no offset) at midnight, or undefined
 * if unparseable.
 */
function parseDateString(raw: string): string | undefined {
  // Remove leading day-of-week (e.g. "Saturday, ")
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '').trim();

  // Match "M/D YYYY"
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{4})$/);
  if (!match) return undefined;

  const month = parseInt(match[1]!, 10);
  const day = parseInt(match[2]!, 10);
  const year = parseInt(match[3]!, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  return `${year}-${pad(month)}-${pad(day)}T00:00:00`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/*  Slug extraction                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extract the event slug from a Vermont.com calendar URL.
 *
 * e.g. "https://vermont.com/calendar/burlington-jazz-festival-2026/"
 *   => "burlington-jazz-festival-2026"
 */
function extractExternalId(href: string): string | null {
  const match = href.match(/\/calendar\/([^/?#]+)/);
  if (!match) return null;
  // Remove trailing slash
  return match[1]!.replace(/\/$/, '') || null;
}

/* ------------------------------------------------------------------ */
/*  Card parsing helpers                                               */
/* ------------------------------------------------------------------ */

type CheerioRoot = ReturnType<typeof cheerio.load>;
type CheerioSelection = ReturnType<CheerioRoot>;

function isDateLike(text: string): boolean {
  return DATE_PATTERN.test(text);
}

function findDateText(card: CheerioSelection, $root: CheerioRoot): string | undefined {
  const primary = card.find('.wpgb-card-date, span:last-of-type').first().text().trim();
  if (primary && isDateLike(primary)) return primary;

  let found: string | undefined;
  card.find('span').each((_, el) => {
    const t = $root(el).text().trim();
    if (isDateLike(t)) {
      found = t;
      return false; // break
    }
  });
  return found;
}

function findLocation(card: CheerioSelection, $root: CheerioRoot): string | undefined {
  const explicit = card.find('.wpgb-card-location').first().text().trim();
  if (explicit) return explicit;

  let last: string | undefined;
  card.find('span').each((_, el) => {
    const t = $root(el).text().trim();
    if (t && !isDateLike(t)) {
      last = t;
    }
  });
  return last;
}

type CardContext = {
  card: CheerioSelection;
  $root: CheerioRoot;
  page: number;
  index: number;
  log: Logger;
};

function parseCard(cc: CardContext): AdapterEvent | undefined {
  const { card, $root, page, index, log } = cc;

  const title = card.find('h3').first().text().trim();
  if (!title) {
    log.debug('skipping card: missing title', { page, index });
    return undefined;
  }

  // Link / external ID
  const rawHref = card.find('a').first().attr('href') ?? '';
  const url = rawHref.startsWith('http') ? rawHref : rawHref ? `${BASE_URL}${rawHref}` : undefined;
  const externalId = extractExternalId(rawHref);

  // Date (required)
  const dateRaw = findDateText(card, $root);
  if (!dateRaw) {
    log.debug('skipping card: missing date', { title, page, index });
    return undefined;
  }

  const localIso = parseDateString(dateRaw);
  if (!localIso) {
    log.warn('skipping card: unparseable date', {
      title,
      dateText: dateRaw,
      page,
      index,
    });
    return undefined;
  }

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
    descriptionHtml: card.find('p').first().html()?.trim() || undefined,
    startsAtUtc,
    tzid: TZID,
    allDay: true,
    venueName: findLocation(card, $root),
    imageUrl: card.find('img').first().attr('src') ?? undefined,
    url,
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const vermontComAdapter: Adapter = {
  key: 'vermont-com',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;

    const cfg = configSchema.parse(source.adapter_config);

    for (let page = 1; page <= cfg.pages; page++) {
      const separator = source.url.includes('?') ? '&' : '?';
      const pageUrl = page === 1 ? source.url : `${source.url}${separator}_page=${page}`;

      log.info('fetching listing page', { url: pageUrl, page });
      const res = await ctx.fetch(pageUrl);
      const html = await res.text();
      const $ = cheerio.load(html);

      const cards = $('.wpgb-card');

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
