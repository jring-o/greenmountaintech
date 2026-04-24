import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import sanitizeHtml from 'sanitize-html';

import EventDetail from '@/components/public/EventDetail';
import { getPublicEventById } from '@/lib/db/queries/events';
import { formatLocal } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  ISR: revalidate every 5 minutes                                     */
/* ------------------------------------------------------------------ */

export const revalidate = 300;

/* ------------------------------------------------------------------ */
/*  Sanitize allowlist (matches spec 13.2)                              */
/* ------------------------------------------------------------------ */

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['https', 'http'],
};

/* ------------------------------------------------------------------ */
/*  Params type                                                         */
/* ------------------------------------------------------------------ */

type PageParams = Promise<{ id: string }>;

/* ------------------------------------------------------------------ */
/*  Metadata                                                            */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEventById(id);

  if (!event) {
    return { title: 'Event Not Found' };
  }

  // eslint-disable-next-line no-restricted-syntax
  const startDate = new Date(event.startsAt);
  const formatted = formatLocal(startDate, event.tzid, 'EEE, MMM d, yyyy');

  const desc = event.description
    ? event.description.slice(0, 160)
    : event.title + ' on ' + formatted;

  return {
    title: event.title + ' -- Vermont Events',
    description: desc,
    openGraph: {
      title: event.title,
      description: desc,
      type: 'article',
      images: ['/events/' + event.id + '/opengraph-image'],
    },
  };
}

/* ------------------------------------------------------------------ */
/*  JSON-LD builder                                                     */
/* ------------------------------------------------------------------ */

function buildJsonLd(event: {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  imageUrl: string | null;
  description: string | null;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    ...(event.venueName
      ? {
          location: {
            '@type': 'Place',
            name: event.venueName,
            ...(event.venueAddress ? { address: event.venueAddress } : {}),
          },
        }
      : {}),
    ...(event.imageUrl ? { image: event.imageUrl } : {}),
    ...(event.description ? { description: event.description } : {}),
    url: baseUrl + '/events/' + event.id,
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default async function EventDetailPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const event = await getPublicEventById(id);

  if (!event) {
    notFound();
  }

  // eslint-disable-next-line no-restricted-syntax
  const startDate = new Date(event.startsAt);
  const formattedStart = formatLocal(startDate, event.tzid);

  const formattedEnd = event.endsAt
    ? // eslint-disable-next-line no-restricted-syntax
      formatLocal(new Date(event.endsAt), event.tzid)
    : null;

  const sanitizedHtml = event.descriptionHtml
    ? sanitizeHtml(event.descriptionHtml, SANITIZE_OPTIONS)
    : null;

  const jsonLd = buildJsonLd(event);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EventDetail
        event={event}
        formattedStart={formattedStart}
        formattedEnd={formattedEnd}
        sanitizedHtml={sanitizedHtml}
      />
    </main>
  );
}
