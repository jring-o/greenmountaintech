/**
 * lib/feeds/ical.ts -- RFC 5545 iCalendar builders.
 *
 * Exports:
 *   - buildCalendar(events)  -- multi-event VCALENDAR for /feed.ics
 *   - buildSingleEvent(event) -- single-event VCALENDAR for /events/[id]/ics
 */

import type { PublicEventDetail, PublicEventItem } from '@/lib/db/queries/events-schema';
import { formatLocal } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRODID = '-//vermont-events//EN';
const CALNAME = 'Vermont Events';

/* ------------------------------------------------------------------ */
/*  RFC 5545 helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fold lines per RFC 5545: content lines should be at most 75 octets.
 * We fold at 74 to leave room for the CRLF.
 */
export function foldLine(line: string): string {
  const MAX = 75;
  if (line.length <= MAX) return line;

  const parts: string[] = [line.slice(0, MAX)];
  let offset = MAX;
  while (offset < line.length) {
    parts.push(' ' + line.slice(offset, offset + MAX - 1));
    offset += MAX - 1;
  }
  return parts.join('\r\n');
}

/**
 * Escape text values per RFC 5545 section 3.3.11.
 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format a UTC ISO string as an iCal local datetime (YYYYMMDDTHHmmss).
 */
function formatIcalDatetime(isoUtc: string, tzid: string): string {
  // eslint-disable-next-line no-restricted-syntax
  const d = new Date(isoUtc);
  return formatLocal(d, tzid, "yyyyMMdd'T'HHmmss");
}

/**
 * Return the domain portion of a site URL for use in UIDs.
 * Strips protocol and trailing slashes.
 */
function getDomainFromUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    return url.hostname;
  } catch {
    return 'localhost';
  }
}

/* ------------------------------------------------------------------ */
/*  VTIMEZONE for America/New_York (static)                            */
/* ------------------------------------------------------------------ */

/**
 * Minimal VTIMEZONE for America/New_York covering EST/EDT transitions.
 * Uses the RRULE form so it is valid for all years.
 */
const VTIMEZONE_AMERICA_NEW_YORK = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
].join('\r\n');

/* ------------------------------------------------------------------ */
/*  VEVENT builder (shared by both public functions)                    */
/* ------------------------------------------------------------------ */

interface VEventInput {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  tzid: string;
  description?: string | null;
  venueName: string | null;
  venueAddress?: string | null;
  category: string;
  tags: string[];
  url: string; // relative /events/[id]
  externalUrl?: string | null;
}

function buildVEventLines(event: VEventInput, siteUrl: string): string[] {
  const domain = getDomainFromUrl(siteUrl);
  const uid = `${event.id}@vermont-events.${domain}`;
  const dtStart = `DTSTART;TZID=${event.tzid}:${formatIcalDatetime(event.startsAt, event.tzid)}`;
  const eventUrl = `${siteUrl}${event.url}`;

  const lines: string[] = ['BEGIN:VEVENT', foldLine(`UID:${uid}`), foldLine(dtStart)];

  if (event.endsAt) {
    const dtEnd = `DTEND;TZID=${event.tzid}:${formatIcalDatetime(event.endsAt, event.tzid)}`;
    lines.push(foldLine(dtEnd));
  }

  lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`));

  if (event.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`));
  }

  const locationParts = [event.venueName, event.venueAddress].filter(Boolean);
  if (locationParts.length > 0) {
    lines.push(foldLine(`LOCATION:${escapeText(locationParts.join(', '))}`));
  }

  lines.push(foldLine(`URL:${eventUrl}`));

  const categories = [event.category, ...event.tags];
  lines.push(foldLine(`CATEGORIES:${categories.map(escapeText).join(',')}`));

  lines.push('END:VEVENT');

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build a multi-event VCALENDAR string for the /feed.ics endpoint.
 *
 * @param events - Array of PublicEventItem from listPublicEvents.
 * @param siteUrl - The NEXT_PUBLIC_SITE_DOMAIN value (e.g. "https://example.com").
 */
export function buildCalendar(events: PublicEventItem[], siteUrl: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${CALNAME}`,
    VTIMEZONE_AMERICA_NEW_YORK,
  ];

  for (const event of events) {
    lines.push(...buildVEventLines(event, siteUrl));
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

/**
 * Build a single-event VCALENDAR string for the /events/[id]/ics endpoint.
 *
 * @param event - A PublicEventDetail from getPublicEventById.
 * @param siteUrl - The NEXT_PUBLIC_SITE_DOMAIN value (e.g. "https://example.com").
 */
export function buildSingleEvent(event: PublicEventDetail, siteUrl: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...buildVEventLines(event, siteUrl),
    'END:VCALENDAR',
  ];

  return lines.join('\r\n') + '\r\n';
}
