/**
 * lib/feeds/rss.ts -- RSS 2.0 feed builder with Atom self-link.
 *
 * Exports:
 *   - buildRss(events, siteUrl) -- RSS 2.0 XML string for /feed.rss
 */

import type { PublicEventItem } from '@/lib/db/queries/events-schema';
import { formatLocal } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  XML helpers                                                        */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format a UTC ISO string to RFC 822 date format as required by RSS 2.0.
 * E.g. "Sun, 15 Jun 2026 22:00:00 +0000"
 */
function toRfc822(isoUtc: string): string {
  // eslint-disable-next-line no-restricted-syntax -- parsing ISO string for RFC 822 formatting
  const d = new Date(isoUtc);
  return d.toUTCString();
}

/* ------------------------------------------------------------------ */
/*  Item builder                                                       */
/* ------------------------------------------------------------------ */

function buildItem(event: PublicEventItem, siteUrl: string): string {
  const eventUrl = `${siteUrl}${event.url}`;

  // Build description: start time + venue prefix + title
  const startFormatted = formatLocal(
    // eslint-disable-next-line no-restricted-syntax -- parsing ISO string for tz-aware formatting
    new Date(event.startsAt),
    event.tzid,
    "EEE, MMM d 'at' h:mm a zzz",
  );
  const venuePart = event.venueName ? ` at ${event.venueName}` : '';
  const descriptionText = `${startFormatted}${venuePart}`;

  // Use startsAt as pubDate (events sorted by starts_at_utc asc per spec)
  const pubDate = toRfc822(event.startsAt);

  const lines: string[] = [
    '    <item>',
    `      <title>${escapeXml(event.title)}</title>`,
    `      <link>${escapeXml(eventUrl)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(eventUrl)}</guid>`,
    `      <pubDate>${pubDate}</pubDate>`,
    `      <description>${escapeXml(descriptionText)}</description>`,
    '    </item>',
  ];

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build an RSS 2.0 XML string for the /feed.rss endpoint.
 *
 * @param events - Array of PublicEventItem from listPublicEvents.
 * @param siteUrl - The NEXT_PUBLIC_SITE_DOMAIN value (e.g. "https://example.com").
 */
export function buildRss(events: PublicEventItem[], siteUrl: string): string {
  const feedUrl = `${siteUrl}/feed.rss`;

  const items = events.map((e) => buildItem(e, siteUrl)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Vermont Events</title>',
    `    <link>${escapeXml(siteUrl)}</link>`,
    '    <description>Curated Vermont community events.</description>',
    '    <language>en-us</language>',
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
