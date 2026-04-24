import { getPublicEventById } from '@/lib/db/queries/events';
import { env } from '@/lib/env';
import { buildSingleEvent } from '@/lib/feeds/ical';
import { log } from '@/lib/log';

/* ------------------------------------------------------------------ */
/*  GET /events/[id]/ics                                                */
/* ------------------------------------------------------------------ */

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const event = await getPublicEventById(id);

    if (!event) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = env.NEXT_PUBLIC_SITE_DOMAIN;
    const ical = buildSingleEvent(event, siteUrl);
    const filename = event.id + '.ics';

    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    log.error('ICS single-event generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}
