import { Suspense } from 'react';

import Calendar from '@/components/public/Calendar';
import Filters from '@/components/public/Filters';
import { listPublicEvents } from '@/lib/db/queries/events';
import { PublicEventsQuerySchema } from '@/lib/db/queries/events-schema';
import type { PublicEventItem } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  JSON-LD builder                                                     */
/* ------------------------------------------------------------------ */

function buildJsonLd(events: PublicEventItem[]) {
  const items = events.slice(0, 25).map((evt, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Event',
      name: evt.title,
      startDate: evt.startsAt,
      ...(evt.endsAt ? { endDate: evt.endsAt } : {}),
      ...(evt.venueName
        ? {
            location: {
              '@type': 'Place',
              name: evt.venueName,
            },
          }
        : {}),
      url: `https://vermontevents.org/events/${evt.id}`,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items,
  };
}

/* ------------------------------------------------------------------ */
/*  Page component                                                      */
/* ------------------------------------------------------------------ */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Extract filter values from search params
  const view = typeof params.view === 'string' ? params.view : undefined;
  const date = typeof params.date === 'string' ? params.date : undefined;
  const region = typeof params.region === 'string' ? params.region : undefined;
  const category = typeof params.category === 'string' ? params.category : undefined;
  const q = typeof params.q === 'string' ? params.q : undefined;

  // Build query through the Zod schema to get proper date defaults
  const queryInput: Record<string, string> = { limit: '500' };
  if (region) queryInput.region = region;
  if (category) queryInput.category = category;
  if (q) queryInput.q = q;

  // Fetch events for JSON-LD (uses schema defaults: from=now, to=now+90d)
  const parsed = PublicEventsQuerySchema.safeParse(queryInput);

  let events: PublicEventItem[] = [];
  if (parsed.success) {
    try {
      const result = await listPublicEvents(parsed.data);
      events = result.events;
    } catch {
      // Silently degrade -- the calendar client island will fetch independently
    }
  }

  const jsonLd = buildJsonLd(events);

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Vermont Events
      </h1>
      <p className="mt-2 text-vermont-slate">Community events across the Green Mountain State.</p>

      <section className="mt-6" aria-label="Event filters">
        <Suspense>
          <Filters />
        </Suspense>
      </section>

      <section className="mt-6" aria-label="Event calendar">
        <Suspense
          fallback={
            <div className="flex h-96 items-center justify-center text-vermont-slate">
              Loading calendar...
            </div>
          }
        >
          <Calendar initialView={view} initialDate={date} />
        </Suspense>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
