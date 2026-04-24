'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { CandidateEventRow, DedupCandidateScore } from '@/lib/db/queries/duplicates';

/* ------------------------------------------------------------------ */
/*  Score parsing                                                      */
/* ------------------------------------------------------------------ */

function parseScoreBreakdown(reason: string): {
  titleScore: string;
  venueScore: string;
  timeScore: string;
  total: string;
} {
  const titleMatch = reason.match(/title=([\d.]+)/);
  const venueMatch = reason.match(/venue=([\d.]+)/);
  const timeMatch = reason.match(/time=([\d.]+)/);
  const totalMatch = reason.match(/total=([\d.]+)/);

  return {
    titleScore: titleMatch?.[1] ?? '-',
    venueScore: venueMatch?.[1] ?? '-',
    timeScore: timeMatch?.[1] ?? '-',
    total: totalMatch?.[1] ?? String(0),
  };
}

/* ------------------------------------------------------------------ */
/*  EventSummary                                                       */
/* ------------------------------------------------------------------ */

function EventSummary({
  label,
  title,
  startsAt,
  venueName,
  region,
  category,
}: {
  label: string;
  title: string;
  startsAt: string;
  venueName: string | null;
  region: string;
  category: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-vermont-slate">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{title}</p>
      <p className="text-xs text-vermont-slate">
        {new Date(startsAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York',
        })}
      </p>
      {venueName && <p className="text-xs text-vermont-slate">{venueName}</p>}
      <p className="text-xs text-vermont-slate">
        {region} / {category}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoreBadge                                                         */
/* ------------------------------------------------------------------ */

function ScoreBadge({
  titleScore,
  venueScore,
  timeScore,
  total,
}: {
  titleScore: string;
  venueScore: string;
  timeScore: string;
  total: string;
}) {
  return (
    <div className="rounded border border-vermont-forest/20 bg-vermont-forest/5 px-2 py-1 text-xs">
      <p className="font-semibold">Score: {total}</p>
      <p>Title: {titleScore}</p>
      <p>Venue: {venueScore}</p>
      <p>Time: {timeScore}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DuplicateCard                                                      */
/* ------------------------------------------------------------------ */

export default function DuplicateCard({
  eventId,
  eventTitle,
  eventStartsAt,
  eventVenueName,
  eventRegion,
  eventCategory,
  candidate,
}: {
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  eventVenueName: string | null;
  eventRegion: string;
  eventCategory: string;
  candidate: DedupCandidateScore & { event: CandidateEventRow | null };
}) {
  const router = useRouter();
  const [merging, startMerge] = useTransition();
  const [splitting, startSplit] = useTransition();

  const scores = parseScoreBreakdown(candidate.reason);

  function handleMerge() {
    startMerge(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: candidate.event_id }),
      });
      if (res.ok) {
        router.refresh();
      }
    });
  }

  function handleSplit() {
    startSplit(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/split`, {
        method: 'POST',
      });
      if (res.ok) {
        router.refresh();
      }
    });
  }

  const busy = merging || splitting;

  return (
    <div className="rounded-lg border border-vermont-forest/20 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Source event */}
        <EventSummary
          label="This event"
          title={eventTitle}
          startsAt={eventStartsAt}
          venueName={eventVenueName}
          region={eventRegion}
          category={eventCategory}
        />

        {/* Score breakdown */}
        <div className="flex flex-col items-center justify-center gap-1">
          <ScoreBadge {...scores} />
        </div>

        {/* Candidate event */}
        {candidate.event ? (
          <EventSummary
            label="Candidate match"
            title={candidate.event.title}
            startsAt={candidate.event.startsAt}
            venueName={candidate.event.venueName}
            region={candidate.event.region}
            category={candidate.event.category}
          />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-vermont-slate">
              Candidate match
            </p>
            <p className="mt-1 text-sm text-vermont-slate italic">
              Event not found (ID: {candidate.event_id})
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleMerge}
          disabled={busy || !candidate.event}
        >
          {merging ? 'Merging...' : 'Confirm merge with this candidate'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleSplit} disabled={busy}>
          {splitting ? 'Splitting...' : 'Split (not a duplicate)'}
        </Button>
      </div>
    </div>
  );
}
