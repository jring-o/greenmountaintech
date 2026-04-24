import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import EventEditForm from '@/components/admin/EventEditForm';
import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';

export default async function QueueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);

  const event = rows[0];
  if (!event) {
    notFound();
  }

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/queue"
            className="text-sm text-vermont-slate hover:text-vermont-forest"
          >
            &larr; Back to Queue
          </Link>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-vermont-forest">
            Edit Event
          </h1>
        </div>
        {event.status === 'published' && (
          <Link
            href={`/events/${event.id}`}
            className="text-sm text-vermont-forest underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on public site (preview)
          </Link>
        )}
      </div>

      <EventEditForm
        event={{
          id: event.id,
          title: event.title,
          description: event.description,
          description_html: event.description_html,
          starts_at_utc: event.starts_at_utc.toISOString(),
          ends_at_utc: event.ends_at_utc ? event.ends_at_utc.toISOString() : null,
          tzid: event.tzid,
          all_day: event.all_day,
          venue_name: event.venue_name,
          venue_address: event.venue_address,
          region: event.region,
          lat: event.lat,
          lng: event.lng,
          url: event.url,
          image_url: event.image_url,
          status: event.status,
          category: event.category,
          tags: event.tags,
          merged_into: event.merged_into,
          published_at: event.published_at ? event.published_at.toISOString() : null,
        }}
      />
    </main>
  );
}
