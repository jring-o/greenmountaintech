import type { EventContentArg } from '@fullcalendar/core';

/* ------------------------------------------------------------------ */
/*  Category label map                                                  */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  music: 'Music',
  arts_theater: 'Arts',
  food_drink: 'Food',
  community_civic: 'Community',
  outdoors_recreation: 'Outdoors',
  family_kids: 'Family',
  education_lecture: 'Education',
  film: 'Film',
  sports: 'Sports',
  farmers_market: 'Market',
  fundraiser: 'Fundraiser',
  tech: 'Tech',
  other: 'Other',
};

/* ------------------------------------------------------------------ */
/*  EventCard                                                           */
/* ------------------------------------------------------------------ */

export default function EventCard({ event }: { event: EventContentArg }) {
  const { title, extendedProps } = event.event;
  const venueName = extendedProps.venueName as string | null | undefined;
  const category = extendedProps.category as string | undefined;
  const tags = extendedProps.tags as string[] | undefined;

  return (
    <div className="flex cursor-pointer flex-col gap-0.5 overflow-hidden px-1 py-0.5">
      <span className="truncate text-xs font-semibold leading-tight text-white">{title}</span>
      {venueName ? (
        <span className="truncate text-[10px] leading-tight text-white/80">{venueName}</span>
      ) : null}
      {category || (tags && tags.length > 0) ? (
        <div className="flex flex-wrap gap-0.5">
          {category && category !== 'other' ? (
            <span className="rounded bg-white/20 px-1 py-px text-[9px] leading-tight text-white">
              {CATEGORY_LABELS[category] ?? category}
            </span>
          ) : null}
          {tags?.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded bg-white/20 px-1 py-px text-[9px] leading-tight text-white"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
