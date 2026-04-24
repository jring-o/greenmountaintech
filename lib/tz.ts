/**
 * lib/tz.ts -- Single home for all time/date arithmetic.
 *
 * DST fall-back ambiguity policy:
 *   When a local time falls in the DST fall-back overlap window (e.g. 1:30 AM
 *   on the first Sunday of November in America/New_York), toUtc() prefers the
 *   **later offset** (standard time / EST / UTC-5) rather than the earlier
 *   offset (daylight time / EDT / UTC-4). This means an ambiguous 1:30 AM is
 *   interpreted as 1:30 AM EST (06:30 UTC), not 1:30 AM EDT (05:30 UTC).
 *
 *   Rationale: for a community calendar the "safe" choice is the later wall-
 *   clock instant so events are never displayed as starting earlier than the
 *   attendee expects.
 */

import { addMonths, endOfDay, startOfDay } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_TZ = 'America/New_York';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TimeZoneGapError extends Error {
  constructor(localIso: string, tzid: string) {
    super(
      `Local time "${localIso}" falls in a DST spring-forward gap for zone "${tzid}" and does not exist.`,
    );
    this.name = 'TimeZoneGapError';
  }
}

// ---------------------------------------------------------------------------
// Core conversions
// ---------------------------------------------------------------------------

/**
 * Convert a wall-clock ISO string (no offset suffix) to a UTC Date.
 *
 * - Throws TimeZoneGapError if the local time falls in a spring-forward gap.
 * - For fall-back overlaps, prefers the later offset (EST over EDT).
 */
export function toUtc(localIso: string, tzid: string = DEFAULT_TZ): Date {
  // Step 1: naive conversion via fromZonedTime (which maps gap times forward).
  const utc = fromZonedTime(localIso, tzid);

  // Step 2: round-trip back to zoned and compare with original parsed values.
  const roundTrip = toZonedTime(utc, tzid);

  // Parse the input local ISO components.
  const parts = localIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) {
    throw new Error(`Invalid local ISO string: "${localIso}"`);
  }

  const inputHour = Number(parts[4]);
  const inputMinute = Number(parts[5]);

  const rtHour = roundTrip.getHours();
  const rtMinute = roundTrip.getMinutes();

  // If round-trip hour/minute differs, the original time fell in a gap.
  if (rtHour !== inputHour || rtMinute !== inputMinute) {
    throw new TimeZoneGapError(localIso, tzid);
  }

  // Step 3: handle fall-back overlap -- prefer the later offset (EST).
  // During an overlap, two distinct UTC instants (1 hour apart) map to the
  // same local wall-clock time. fromZonedTime picks the earlier (DST) instant.
  // We detect overlap by checking if (utc + 1h) also round-trips to the same
  // local hour:minute. If so, the later instant is the standard-time / EST one
  // and we return it per our "prefer the later offset" policy.
  const laterCandidate = new Date(utc.getTime() + 3_600_000);
  const laterRt = toZonedTime(laterCandidate, tzid);

  if (laterRt.getHours() === inputHour && laterRt.getMinutes() === inputMinute) {
    return laterCandidate;
  }

  return utc;
}

/**
 * Convert a UTC Date to a "zoned" Date whose `.getHours()` etc. reflect local
 * wall-clock time in the given time zone.
 */
export function toZoned(utc: Date, tzid: string = DEFAULT_TZ): Date {
  return toZonedTime(utc, tzid);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const DEFAULT_FORMAT = "EEE, MMM d '\u00b7' h:mm a zzz";

/**
 * Format a UTC Date as a human-readable string in the given time zone.
 */
export function formatLocal(
  utc: Date,
  tzid: string = DEFAULT_TZ,
  pattern: string = DEFAULT_FORMAT,
): string {
  return formatInTimeZone(utc, tzid, pattern);
}

/**
 * Return the ISO-8601 UTC string for a Date (equivalent to `.toISOString()`).
 */
export function isoUtc(d: Date): string {
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Day boundaries
// ---------------------------------------------------------------------------

/**
 * Get the UTC instant corresponding to the start of the day (00:00:00) in the
 * given time zone for the date represented by `utc`.
 */
export function startOfDayInTz(utc: Date, tzid: string): Date {
  const zoned = toZoned(utc, tzid);
  const dayStart = startOfDay(zoned);
  return fromZonedTime(dayStart, tzid);
}

/**
 * Get the UTC instant corresponding to the end of the day (23:59:59.999) in
 * the given time zone for the date represented by `utc`.
 */
export function endOfDayInTz(utc: Date, tzid: string): Date {
  const zoned = toZoned(utc, tzid);
  const dayEnd = endOfDay(zoned);
  return fromZonedTime(dayEnd, tzid);
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Add (or subtract) calendar months in the context of a time zone, preserving
 * the local wall-clock time where possible.
 */
export function addMonthsTz(d: Date, months: number, tzid: string): Date {
  const zoned = toZoned(d, tzid);
  const shifted = addMonths(zoned, months);
  return fromZonedTime(shifted, tzid);
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds as a human-readable seconds string.
 * Returns an em-dash when the value is null (i.e. duration unknown).
 */
export function formatDurationMs(ms: number | null): string {
  if (ms === null) return '\u2014';
  return (ms / 1000).toFixed(1) + 's';
}
