import { NextRequest } from 'next/server';

import { PublicEventsQuerySchema, listPublicEvents } from '@/lib/db/queries/events';
import { env } from '@/lib/env';
import { buildCalendar } from '@/lib/feeds/ical';
import { log } from '@/lib/log';

export const runtime = 'nodejs';

const CACHE_CONTROL = 'public, max-age=600, s-maxage=600';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Build query: default from=now, to=now+12months
  // eslint-disable-next-line no-restricted-syntax -- server-side feed default window
  const now = new Date();
  // eslint-disable-next-line no-restricted-syntax -- derive 12-month window from `now`
  const twelveMonthsLater = new Date(now);
  twelveMonthsLater.setMonth(twelveMonthsLater.getMonth() + 12);

  const rawParams: Record<string, string> = Object.fromEntries(searchParams.entries());

  // Apply feed-specific defaults: from=now, to=now+12mo, limit=500
  if (!rawParams.from) {
    rawParams.from = now.toISOString();
  }
  if (!rawParams.to) {
    rawParams.to = twelveMonthsLater.toISOString();
  }
  if (!rawParams.limit) {
    rawParams.limit = '500';
  }

  const parsed = PublicEventsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return new Response('Invalid query parameters', { status: 422 });
  }

  try {
    const result = await listPublicEvents(parsed.data);
    const siteUrl = env.NEXT_PUBLIC_SITE_DOMAIN;
    const ical = buildCalendar(result.events, siteUrl);

    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': CACHE_CONTROL,
      },
    });
  } catch (err) {
    log.error('iCal feed generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}
