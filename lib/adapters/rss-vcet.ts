/**
 * lib/adapters/rss-vcet.ts -- VCET-specific RSS adapter.
 *
 * VCET publishes WordPress blog posts as RSS items with the event date
 * encoded as a YYYY-MM-DD suffix on the slug, e.g.:
 *   https://vcet.co/vcet-launches-ai-after-hours-...-2026-04-08/
 *
 * The generic RSS adapter doesn't know this convention and feeds chrono
 * the contentSnippet (which usually omits the date), producing wrong
 * dates for VCET posts.
 *
 * Strategy:
 *   1. Try to extract YYYY-MM-DD from the URL slug. (Primary signal —
 *      VCET is consistent about this.)
 *   2. Fall back to chrono-node on item.content (the full HTML body),
 *      not just contentSnippet.
 *   3. If both fail, skip the item rather than guessing.
 *
 * Items skipped are logged with a warning so we can see what slipped
 * through.
 */

import * as chrono from 'chrono-node';
import Parser from 'rss-parser';
import { z } from 'zod';

import { toUtc } from '@/lib/tz';

import { isAllowed } from './helpers/robots';
import type { Adapter, AdapterContext, AdapterEvent } from './types';
import { RobotsDisallowedError } from './types';

const UA = 'VermontEventsBot/1.0';

const configSchema = z
  .object({
    tzid: z.string().default('America/New_York'),
  })
  .default({ tzid: 'America/New_York' });

/* ------------------------------------------------------------------ */
/*  Date extraction                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pull a YYYY-MM-DD from the end of a URL slug (allowing a trailing slash).
 * Returns null if no such pattern is found.
 */
export function dateFromSlug(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(\d{4})-(\d{2})-(\d{2})\/?$/);
  if (!match) return null;
  const [, y, m, d] = match;
  // Sanity-bound the values so a random "1234-56-78" doesn't pass through.
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${y}-${m}-${d}T00:00:00`;
}

/**
 * Best-effort date extraction from the full HTML content using chrono.
 * Returns the first parsed wall-clock ISO string, or null.
 */
export function dateFromContent(content: string | undefined): string | null {
  if (!content) return null;
  // Strip HTML tags so chrono sees only text. Cheap regex; good enough
  // for VCET's WordPress post bodies.
  const text = content.replace(/<[^>]+>/g, ' ');
  const parsed = chrono.parse(text);
  if (parsed.length === 0 || !parsed[0]) return null;
  const c = parsed[0].start;
  // Require an explicit year to avoid silently guessing past or future dates.
  // VCET posts always include the year either via the slug (primary path) or
  // explicitly in the body text.
  const year = c.get('year');
  const month = c.get('month');
  const day = c.get('day');
  if (year === null || year === undefined) return null;
  if (month === null || month === undefined) return null;
  if (day === null || day === undefined) return null;
  const hour = c.get('hour') ?? 0;
  const minute = c.get('minute') ?? 0;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const vcetAdapter: Adapter = {
  key: 'vcet',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;

    const allowed = await isAllowed(source.url, UA);
    if (!allowed) {
      throw new RobotsDisallowedError(source.url);
    }

    const cfg = configSchema.parse(source.adapter_config);
    const tzid = cfg.tzid;

    log.info('fetching VCET RSS feed', { url: source.url });
    const parser = new Parser({ headers: { 'User-Agent': UA } });
    const feed = await parser.parseURL(source.url);

    for (const item of feed.items) {
      if (!item.title) {
        log.debug('skipping VCET item: missing title', { link: item.link });
        continue;
      }

      const externalId = item.guid ?? item.link ?? null;

      // 1. Primary: slug-encoded date.
      let localIso = dateFromSlug(item.link);
      let dateSource: 'slug' | 'content' = 'slug';

      // 2. Fallback: chrono on the full content.
      if (!localIso) {
        localIso = dateFromContent(item.content ?? item.contentSnippet);
        dateSource = 'content';
      }

      if (!localIso) {
        log.warn('skipping VCET item: no date in slug or content', {
          title: item.title,
          link: item.link,
          externalId,
        });
        continue;
      }

      let startsAtUtc: Date;
      try {
        startsAtUtc = toUtc(localIso, tzid);
      } catch (e) {
        log.warn('skipping VCET item: toUtc failed', {
          title: item.title,
          localIso,
          dateSource,
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }

      log.debug('VCET event ingested', {
        title: item.title,
        startsAtUtc: startsAtUtc.toISOString(),
        dateSource,
      });

      yield {
        externalId,
        title: item.title,
        description: item.contentSnippet,
        descriptionHtml: item.content,
        startsAtUtc,
        tzid,
        url: item.link,
      };
    }
  },
};
