/**
 * lib/ingest/normalize.ts -- Transform an AdapterEvent into an EventRowCandidate.
 *
 * Implements all 10 normalization steps from the spec (section 13).
 */

import { createHash } from 'node:crypto';

import { fromZonedTime } from 'date-fns-tz';

import type { AdapterEvent, Logger, Region, EventCategory } from '@/lib/adapters/types';
import type { SourceRow } from '@/lib/db/schema';
import { computeDedupeKey } from '@/lib/ingest/dedupe';
import { htmlToText, sanitizeHtml } from '@/lib/ingest/sanitize';
import { DEFAULT_TZ } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * The shape produced by normalize() -- ready for persistence.
 * Mirrors the events table columns minus auto-generated fields
 * (id, created_at, updated_at, search_tsv) and status/published_at
 * which are set by the persist layer.
 */
export type EventRowCandidate = {
  source_id: string;
  external_id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  starts_at_utc: Date;
  ends_at_utc: Date | null;
  tzid: string;
  all_day: boolean;
  venue_name: string | null;
  venue_address: string | null;
  region: Region;
  lat: string | null;
  lng: string | null;
  url: string | null;
  image_url: string | null;
  category: EventCategory;
  tags: string[];
  dedupe_key: string;
};

/* ------------------------------------------------------------------ */
/*  Errors                                                              */
/* ------------------------------------------------------------------ */

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const TITLE_MAX_LEN = 300;
const TITLE_MIN_LEN = 3;
const DESCRIPTION_MAX_LEN = 10_000;
const TAGS_MAX = 12;
const URL_RE = /^https?:\/\//;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Collapse runs of whitespace into a single space and trim. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Truncate at max length, appending ellipsis if truncated. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

/** Validate a URL matches https?:// -- return the URL or null. */
function validateUrl(value: string | undefined, field: string, log: Logger): string | null {
  if (!value) return null;
  if (URL_RE.test(value)) return value;
  log.debug(`Dropping invalid ${field}: not http(s)://`, { value });
  return null;
}

/**
 * Derive a stable hash from title + startsAtUtc + venueName
 * to use as external_id when none is provided by the adapter.
 */
function deriveExternalId(title: string, startsAtUtc: Date, venueName: string | null): string {
  const input = `${title}|${startsAtUtc.toISOString()}|${venueName ?? ''}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/* ------------------------------------------------------------------ */
/*  normalize()                                                         */
/* ------------------------------------------------------------------ */

/**
 * Transform an AdapterEvent into an EventRowCandidate.
 * Throws NormalizeError when the event is invalid (e.g. title too short).
 */
export function normalize(
  adapterEvent: AdapterEvent,
  source: SourceRow,
  log: Logger,
): EventRowCandidate {
  // ---- Step 1: Title ----
  let title = collapseWhitespace(adapterEvent.title);
  if (title.length < TITLE_MIN_LEN) {
    throw new NormalizeError(
      `Title too short after trim (${title.length} chars, min ${TITLE_MIN_LEN}): "${title}"`,
    );
  }
  title = truncate(title, TITLE_MAX_LEN);

  // ---- Step 2: Descriptions ----
  let descriptionHtml: string | null = null;
  let description: string | null = null;

  if (adapterEvent.descriptionHtml) {
    descriptionHtml = sanitizeHtml(adapterEvent.descriptionHtml);
    description = truncate(htmlToText(descriptionHtml), DESCRIPTION_MAX_LEN);
  } else if (adapterEvent.description) {
    description = truncate(adapterEvent.description, DESCRIPTION_MAX_LEN);
  }

  // ---- Step 3: Times ----
  const tzid = adapterEvent.tzid || DEFAULT_TZ;
  let startsAtUtc = adapterEvent.startsAtUtc;
  let endsAtUtc = adapterEvent.endsAtUtc ?? null;

  // ---- Step 4: All-day events ----
  const allDay = adapterEvent.allDay ?? false;
  if (allDay) {
    // Force startsAtUtc to 00:00 in source tzid, then convert to UTC.
    // We extract the date part of the existing startsAtUtc in tzid context.
    const zonedIso = formatDateInTz(startsAtUtc, tzid);
    const midnight = `${zonedIso}T00:00:00`;
    startsAtUtc = fromZonedTime(midnight, tzid);

    if (!endsAtUtc) {
      // endsAtUtc = startsAtUtc + 24 hours
      endsAtUtc = new Date(startsAtUtc.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  // ---- Step 5: Region ----
  const region: Region = adapterEvent.region ?? 'statewide';

  // ---- Step 6: Category ----
  const category: EventCategory = adapterEvent.category ?? 'other';

  // ---- Step 7: Tags ----
  const tags = normalizeTags(adapterEvent.tags);

  // ---- Step 8: URL & imageUrl ----
  const url = validateUrl(adapterEvent.url, 'url', log);
  const imageUrl = validateUrl(adapterEvent.imageUrl, 'imageUrl', log);

  // ---- Step 9: External id ----
  const externalId =
    adapterEvent.externalId?.trim() ||
    deriveExternalId(title, startsAtUtc, adapterEvent.venueName ?? null);

  // ---- Step 10: Build candidate, then compute dedupe key ----
  const candidate: EventRowCandidate = {
    source_id: source.id,
    external_id: externalId,
    title,
    description,
    description_html: descriptionHtml,
    starts_at_utc: startsAtUtc,
    ends_at_utc: endsAtUtc,
    tzid,
    all_day: allDay,
    venue_name: adapterEvent.venueName?.trim() ?? null,
    venue_address: adapterEvent.venueAddress?.trim() ?? null,
    region,
    lat: adapterEvent.lat != null ? String(adapterEvent.lat) : null,
    lng: adapterEvent.lng != null ? String(adapterEvent.lng) : null,
    url,
    image_url: imageUrl,
    category,
    tags,
    dedupe_key: '', // placeholder -- computed next
  };

  candidate.dedupe_key = computeDedupeKey(candidate);

  return candidate;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Format a UTC date as yyyy-MM-dd in the given timezone.
 * Uses manual extraction to avoid depending on formatInTimeZone here
 * (the dedupe module already imports it).
 */
function formatDateInTz(utc: Date, tzid: string): string {
  // Use Intl.DateTimeFormat to get the date parts in the target zone.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(utc); // en-CA gives yyyy-MM-dd
}

/**
 * Normalize tags: lowercase, trim, dedupe, drop empties, cap at TAGS_MAX.
 */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = raw.toLowerCase().trim();
    if (tag.length === 0) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= TAGS_MAX) break;
  }

  return result;
}
