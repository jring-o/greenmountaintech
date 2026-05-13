/**
 * lib/adapters/ical.ts -- Generic iCal adapter.
 *
 * Uses `node-ical` to fetch and parse iCalendar feeds. For Turbopack
 * compatibility issues, `next-ical` can serve as a drop-in replacement.
 *
 * RRULE expansion, EXDATE filtering, and recurrence-override merging are
 * handled inline per §8.3. TZID re-anchoring follows §15.4.
 */

import { addMonths } from 'date-fns';
import * as nodeIcal from 'node-ical';
import type {
  CalendarComponent,
  CalendarResponse,
  DateWithTimeZone,
  ParameterValue,
  VEvent,
} from 'node-ical';
import { z } from 'zod';

import { eventCategoryEnum } from '@/lib/db/schema';
import { DEFAULT_TZ, toUtc } from '@/lib/tz';

import { isAllowed } from './helpers/robots';
import type { Adapter, AdapterContext, AdapterEvent, EventCategory } from './types';
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
    tzid: z.string().optional(),
    /** When set, every VEVENT from this feed gets this category (e.g. Meetup tech calendars). */
    default_category: z.enum(eventCategoryEnum.enumValues).optional(),
  })
  .optional();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Extract the plain string from a ParameterValue<string>. */
function paramVal(v: ParameterValue<string> | undefined): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  return v.val;
}

/**
 * TZID re-anchor for timed (non-all-day) events per §15.4.
 *
 * node-ical v0.26+ converts TZID dates to UTC internally, so the Date value
 * is already correct regardless of whether `.tz` is set. All-day events are
 * handled separately by `reanchorAllDay`.
 */
function reanchor(d: DateWithTimeZone): Date {
  return d;
}

/**
 * For all-day events, the start is a DATE (no time component).
 * node-ical parses these as midnight UTC but the actual date might differ
 * due to timezone offset. We extract the date portion and anchor to midnight
 * in the event's timezone.
 */
function reanchorAllDay(d: DateWithTimeZone, defaultTz: string): Date {
  const iso = d.toISOString().slice(0, 10) + 'T00:00:00';
  return toUtc(iso, d.tz ?? defaultTz);
}

/**
 * Extract the first `https?://...` URL from a description string.
 */
function extractUrl(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const match = description.match(/https?:\/\/[^\s<>"]+/);
  return match ? match[0] : undefined;
}

/** Format a Date key suitable for EXDATE comparison (ISO date portion). */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const icalAdapter: Adapter = {
  key: 'generic',
  configSchema,

  async *ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent> {
    const { source, log, now: getNow } = ctx;

    // 1. Check robots.txt
    const allowed = await isAllowed(source.url, UA);
    if (!allowed) {
      throw new RobotsDisallowedError(source.url);
    }

    // 2. Parse config for default TZID override
    const cfg = configSchema.parse(source.adapter_config);
    const defaultTz = cfg?.tzid ?? DEFAULT_TZ;
    const defaultCategory = cfg?.default_category;

    // 3. Fetch + parse the iCal feed
    // The type definitions for fromURL with options claim void return, but at
    // runtime node-ical returns Promise<CalendarResponse> when no callback is
    // passed. Cast to correct the type.
    log.info('fetching iCal feed', { url: source.url });
    const data = (await nodeIcal.async.fromURL(source.url, {
      headers: { 'User-Agent': UA },
    })) as unknown as CalendarResponse;

    const now = getNow();
    const horizon = addMonths(now, 12);

    // 4. Iterate over all components
    for (const key of Object.keys(data)) {
      const component = data[key] as CalendarComponent | undefined;
      if (!component || component.type !== 'VEVENT') continue;

      const event = component as VEvent;

      // Skip if missing required fields
      if (!event.uid || !event.start || !event.summary) {
        log.debug('skipping VEVENT missing uid/start/summary', {
          uid: event.uid,
        });
        continue;
      }

      const isAllDay = event.datetype === 'date';

      if (event.rrule) {
        // -- Recurring event --
        yield* expandRecurring(event, now, horizon, defaultTz, isAllDay, log, defaultCategory);
      } else {
        // -- Single-occurrence event --
        yield buildAdapterEvent(
          event,
          event.start,
          event.end,
          defaultTz,
          isAllDay,
          defaultCategory,
        );
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/*  RRULE expansion                                                    */
/* ------------------------------------------------------------------ */

function* expandRecurring(
  event: VEvent,
  now: Date,
  horizon: Date,
  defaultTz: string,
  isAllDay: boolean,
  log: { debug: (msg: string, extra?: Record<string, unknown>) => void },
  defaultCategory: EventCategory | undefined,
): Generator<AdapterEvent> {
  const occurrences = event.rrule!.between(now, horizon);
  const exdateSet = buildExdateSet(event.exdate);
  const durationMs = event.end && event.start ? event.end.getTime() - event.start.getTime() : 0;

  for (const occDate of occurrences) {
    const occKey = dateKey(occDate);

    if (exdateSet.has(occKey)) {
      log.debug('skipping EXDATE occurrence', {
        uid: event.uid,
        date: occKey,
      });
      continue;
    }

    yield buildOccurrenceEvent(
      event,
      occDate,
      occKey,
      durationMs,
      defaultTz,
      isAllDay,
      defaultCategory,
    );
  }
}

/** Build an AdapterEvent for a single RRULE occurrence, applying overrides. */
function buildOccurrenceEvent(
  event: VEvent,
  occDate: Date,
  occKey: string,
  durationMs: number,
  defaultTz: string,
  isAllDay: boolean,
  defaultCategory: EventCategory | undefined,
): AdapterEvent {
  const override = event.recurrences?.[occKey] as Omit<VEvent, 'recurrences'> | undefined;

  if (override) {
    return buildAdapterEvent(
      override,
      override.start as DateWithTimeZone,
      override.end as DateWithTimeZone | undefined,
      defaultTz,
      override.datetype === 'date',
      defaultCategory,
    );
  }

  const occStart = occDate as DateWithTimeZone;
  if (event.start.tz) {
    occStart.tz = event.start.tz;
  }
  const occEnd = durationMs
    ? (Object.assign(new Date(occDate.getTime() + durationMs), {
        tz: event.start.tz,
      }) as DateWithTimeZone)
    : undefined;

  return buildAdapterEvent(event, occStart, occEnd, defaultTz, isAllDay, defaultCategory);
}

/** Collect EXDATE entries into a Set of date-only keys for fast lookup. */
function buildExdateSet(exdate: Record<string, DateWithTimeZone> | undefined): Set<string> {
  const result = new Set<string>();
  if (!exdate) return result;

  for (const key of Object.keys(exdate)) {
    const d = exdate[key];
    if (d) {
      result.add(dateKey(d));
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Build AdapterEvent                                                 */
/* ------------------------------------------------------------------ */

function buildAdapterEvent(
  event: VEvent | Omit<VEvent, 'recurrences'>,
  start: DateWithTimeZone,
  end: DateWithTimeZone | undefined,
  defaultTz: string,
  allDay: boolean,
  defaultCategory: EventCategory | undefined,
): AdapterEvent {
  const vEvent = event as VEvent;
  const title = paramVal(vEvent.summary) ?? '';
  const description = paramVal(vEvent.description);
  const location = paramVal(vEvent.location);
  const eventUrl = typeof vEvent.url === 'string' ? vEvent.url : undefined;

  const startsAtUtc = allDay ? reanchorAllDay(start, defaultTz) : reanchor(start);

  const endsAtUtc = end ? (allDay ? reanchorAllDay(end, defaultTz) : reanchor(end)) : undefined;

  const resolvedUrl = eventUrl ?? extractUrl(description);

  return {
    externalId: typeof vEvent.uid === 'string' ? vEvent.uid : null,
    title,
    description,
    startsAtUtc,
    endsAtUtc,
    tzid: start.tz ?? defaultTz,
    allDay: allDay || undefined,
    venueName: location,
    url: resolvedUrl,
    ...(defaultCategory ? { category: defaultCategory } : {}),
  };
}
