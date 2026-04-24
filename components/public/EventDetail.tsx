import Image from 'next/image';
import Link from 'next/link';

import type { PublicEventDetail } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Category label map                                                  */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  music: 'Music',
  arts_theater: 'Arts & Theater',
  food_drink: 'Food & Drink',
  community_civic: 'Community & Civic',
  outdoors_recreation: 'Outdoors & Recreation',
  family_kids: 'Family & Kids',
  education_lecture: 'Education & Lecture',
  film: 'Film',
  sports: 'Sports',
  farmers_market: "Farmers' Market",
  fundraiser: 'Fundraiser',
  other: 'Other',
};

/* ------------------------------------------------------------------ */
/*  Region label map                                                    */
/* ------------------------------------------------------------------ */

const REGION_LABELS: Record<string, string> = {
  burlington_area: 'Burlington Area',
  champlain_valley: 'Champlain Valley',
  central_vt: 'Central Vermont',
  northeast_kingdom: 'Northeast Kingdom',
  southern_vt: 'Southern Vermont',
  statewide: 'Statewide',
};

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface EventDetailProps {
  event: PublicEventDetail;
  /** Pre-formatted local time string for start (from server via formatLocal). */
  formattedStart: string;
  /** Pre-formatted local time string for end, or null. */
  formattedEnd: string | null;
  /** Sanitized HTML description, or null. */
  sanitizedHtml: string | null;
}

/* ------------------------------------------------------------------ */
/*  EventDetail                                                         */
/* ------------------------------------------------------------------ */

export default function EventDetail({
  event,
  formattedStart,
  formattedEnd,
  sanitizedHtml,
}: EventDetailProps) {
  const regionLabel = REGION_LABELS[event.region] ?? event.region;
  const categoryLabel = CATEGORY_LABELS[event.category] ?? event.category;

  return (
    <article className="space-y-8">
      {/* Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-vermont-forest/10">
        <Image
          src={event.imageUrl ?? '/placeholder-event.svg'}
          alt={event.imageUrl ? event.title : 'Event placeholder'}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 800px"
          priority
        />
      </div>

      {/* Header */}
      <header className="space-y-4">
        {/* Category badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block rounded bg-vermont-forest/10 px-2.5 py-0.5 text-xs font-medium text-vermont-forest">
            {categoryLabel}
          </span>
          <span className="text-sm text-vermont-slate">{regionLabel}</span>
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
          {event.title}
        </h1>
      </header>

      {/* Time block */}
      <div className="space-y-1 border-l-2 border-vermont-forest/20 pl-4">
        <p className="text-base font-medium text-vermont-forest">{formattedStart}</p>
        {formattedEnd ? (
          <p className="text-sm text-vermont-slate">
            {'Ends: '}
            {formattedEnd}
          </p>
        ) : null}
        {event.allDay ? <p className="text-sm text-vermont-slate">All day</p> : null}
      </div>

      {/* Venue */}
      {event.venueName ? (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-vermont-slate">
            Venue
          </h2>
          <p className="text-base text-vermont-forest">{event.venueName}</p>
          {event.venueAddress ? (
            <p className="text-sm text-vermont-slate">{event.venueAddress}</p>
          ) : null}
        </div>
      ) : null}

      {/* Description */}
      {sanitizedHtml ? (
        <div className="prose prose-sm max-w-none text-vermont-slate prose-headings:text-vermont-forest prose-a:text-vermont-forest">
          <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
        </div>
      ) : event.description ? (
        <div className="prose prose-sm max-w-none text-vermont-slate">
          <p className="whitespace-pre-line">{event.description}</p>
        </div>
      ) : null}

      {/* Tags */}
      {event.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {event.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-vermont-forest/20 px-3 py-1 text-xs text-vermont-slate"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Source attribution */}
      {event.sourceName && event.externalUrl ? (
        <p className="text-sm text-vermont-slate">
          {'Source: '}
          <a
            href={event.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-vermont-forest"
          >
            {event.sourceName}
          </a>
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-4 border-t border-vermont-forest/10 pt-6">
        <a
          href={`/events/${event.id}/ics`}
          download={`${event.id}.ics`}
          className="rounded-md bg-vermont-forest px-4 py-2 text-sm font-medium text-vermont-cream transition-colors hover:bg-vermont-forest/90"
        >
          Add to calendar
        </a>
        <Link
          href="/"
          className="rounded-md border border-vermont-forest/20 px-4 py-2 text-sm font-medium text-vermont-forest transition-colors hover:bg-vermont-forest/5"
        >
          Back to events
        </Link>
      </div>
    </article>
  );
}
