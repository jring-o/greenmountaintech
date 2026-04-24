/**
 * lib/adapters/rss.ts -- Generic RSS adapter.
 *
 * Uses `rss-parser` to parse RSS feeds and yield AdapterEvents.
 * Supports two configurable date-extraction behaviors:
 *   - `useItemDateAsStart`: treat pubDate as the event start time.
 *   - `parseDatesFromBody`: use chrono-node to extract dates from body text.
 *
 * Implements the algorithm described in spec section 8.4.
 */

import * as chrono from 'chrono-node';
import Parser from 'rss-parser';
import { z } from 'zod';

import { toUtc } from '@/lib/tz';

import { isAllowed } from './helpers/robots';
import type { Adapter, AdapterContext, AdapterEvent } from './types';
import { RobotsDisallowedError } from './types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const UA = 'VermontEventsBot/1.0';

/* ------------------------------------------------------------------ */
/*  Config schema                                                      */
/* ------------------------------------------------------------------ */

const configSchema = z
  .object({
    tzid: z.string().default('America/New_York'),
    useItemDateAsStart: z.boolean().default(false),
    parseDatesFromBody: z.boolean().default(false),
  })
  .default({ tzid: 'America/New_York', useItemDateAsStart: false, parseDatesFromBody: false });

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const rssAdapter: Adapter = {
  key: 'generic',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log } = ctx;

    // 1. Check robots.txt before fetching
    const allowed = await isAllowed(source.url, UA);
    if (!allowed) {
      throw new RobotsDisallowedError(source.url);
    }

    // 2. Parse adapter config
    const cfg = configSchema.parse(source.adapter_config);
    const tzid = cfg.tzid;

    // 3. Fetch + parse the RSS feed (rss-parser handles HTTP internally)
    log.info('fetching RSS feed', { url: source.url });
    const parser = new Parser({
      headers: { 'User-Agent': UA },
    });
    const feed = await parser.parseURL(source.url);

    // 4. Iterate over feed items
    for (const item of feed.items) {
      // Skip items without a title
      if (!item.title) {
        log.debug('skipping RSS item: missing title', {
          guid: item.guid,
          link: item.link,
        });
        continue;
      }

      // Compute externalId: guid ?? link
      const externalId = item.guid ?? item.link ?? null;

      // Determine startsAtUtc based on config flags
      let startsAtUtc: Date | undefined;

      if (cfg.useItemDateAsStart && item.pubDate) {
        startsAtUtc = new Date(item.pubDate);
      } else if (cfg.parseDatesFromBody) {
        // Try to parse a date from contentSnippet or title via chrono-node
        const textToParse = item.contentSnippet ?? item.title;
        const parsed = chrono.parse(textToParse);
        if (parsed.length > 0 && parsed[0]) {
          const wallIso = formatChronoToIso(parsed[0].start);
          startsAtUtc = toUtc(wallIso, tzid);
        } else {
          log.warn('skipping RSS item: parseDatesFromBody found no date', {
            title: item.title,
            externalId,
          });
          continue;
        }
      } else {
        // Neither flag is set -- cannot determine event date
        log.warn('skipping RSS item: useItemDateAsStart=false and parseDatesFromBody=false', {
          title: item.title,
          externalId,
        });
        continue;
      }

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert chrono ParsedComponents to an ISO-8601 wall-clock string
 * (no offset) suitable for passing to toUtc().
 */
function formatChronoToIso(components: chrono.ParsedComponents): string {
  const d = components.get('day') ?? 1;
  const m = components.get('month') ?? 1;
  const y = components.get('year') ?? new Date().getFullYear();
  const h = components.get('hour') ?? 0;
  const min = components.get('minute') ?? 0;
  const sec = components.get('second') ?? 0;

  return (
    `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` +
    `T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  );
}
