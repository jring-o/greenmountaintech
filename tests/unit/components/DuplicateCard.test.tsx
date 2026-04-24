/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

/* ------------------------------------------------------------------ */
/*  Import component under test                                        */
/* ------------------------------------------------------------------ */

import DuplicateCard from '@/components/admin/DuplicateCard';
import type { CandidateEventRow, DedupCandidateScore } from '@/lib/db/queries/duplicates';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCandidate(
  overrides: Partial<DedupCandidateScore & { event: CandidateEventRow | null }> = {},
): DedupCandidateScore & { event: CandidateEventRow | null } {
  return {
    event_id: '550e8400-e29b-41d4-a716-446655440099',
    score: 0.85,
    reason: 'title=0.90 venue=0.80 time=0.70 total=0.850',
    event: {
      id: '550e8400-e29b-41d4-a716-446655440099',
      title: 'Jazz Night',
      startsAt: '2026-05-01T20:00:00.000Z',
      endsAt: null,
      venueName: 'Jazz Club',
      region: 'burlington_area',
      category: 'music',
      status: 'published',
    },
    ...overrides,
  };
}

function renderCard(
  overrides: {
    candidate?: DedupCandidateScore & { event: CandidateEventRow | null };
    eventTitle?: string;
    eventVenueName?: string | null;
  } = {},
) {
  const candidate = overrides.candidate ?? makeCandidate();
  return render(
    <DuplicateCard
      eventId="550e8400-e29b-41d4-a716-446655440001"
      eventTitle={overrides.eventTitle ?? 'Open Mic Night'}
      eventStartsAt="2026-05-01T19:00:00.000Z"
      eventVenueName={overrides.eventVenueName ?? 'Club'}
      eventRegion="burlington_area"
      eventCategory="music"
      candidate={candidate}
    />,
  );
}

/* ------------------------------------------------------------------ */
/*  Cleanup                                                            */
/* ------------------------------------------------------------------ */

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  Tests: Score parsing (parseScoreBreakdown)                         */
/* ------------------------------------------------------------------ */

describe('DuplicateCard score breakdown display', () => {
  it('displays parsed title, venue, time, and total scores from reason string', () => {
    renderCard();

    // The ScoreBadge component renders these
    expect(screen.getByText('Title: 0.90')).toBeDefined();
    expect(screen.getByText('Venue: 0.80')).toBeDefined();
    expect(screen.getByText('Time: 0.70')).toBeDefined();
    expect(screen.getByText('Score: 0.850')).toBeDefined();
  });

  it('displays dash for missing score components in reason string', () => {
    const candidate = makeCandidate({
      reason: 'total=0.50',
    });
    renderCard({ candidate });

    expect(screen.getByText('Title: -')).toBeDefined();
    expect(screen.getByText('Venue: -')).toBeDefined();
    expect(screen.getByText('Time: -')).toBeDefined();
    expect(screen.getByText('Score: 0.50')).toBeDefined();
  });

  it('displays "0" for total when reason has no total match', () => {
    const candidate = makeCandidate({
      reason: 'title=0.90 venue=0.80 time=0.70',
    });
    renderCard({ candidate });

    expect(screen.getByText('Score: 0')).toBeDefined();
    expect(screen.getByText('Title: 0.90')).toBeDefined();
  });

  it('handles empty reason string gracefully', () => {
    const candidate = makeCandidate({ reason: '' });
    renderCard({ candidate });

    expect(screen.getByText('Title: -')).toBeDefined();
    expect(screen.getByText('Venue: -')).toBeDefined();
    expect(screen.getByText('Time: -')).toBeDefined();
    expect(screen.getByText('Score: 0')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Rendering                                                   */
/* ------------------------------------------------------------------ */

describe('DuplicateCard rendering', () => {
  it('renders the source event title', () => {
    renderCard({ eventTitle: 'Open Mic Night' });
    expect(screen.getByText('Open Mic Night')).toBeDefined();
  });

  it('renders the candidate event title', () => {
    renderCard();
    expect(screen.getByText('Jazz Night')).toBeDefined();
  });

  it('renders "This event" and "Candidate match" labels', () => {
    renderCard();
    expect(screen.getByText('This event')).toBeDefined();
    expect(screen.getByText('Candidate match')).toBeDefined();
  });

  it('renders venue name when provided', () => {
    renderCard({ eventVenueName: 'Radio Bean' });
    expect(screen.getByText('Radio Bean')).toBeDefined();
  });

  it('renders "Event not found" when candidate.event is null', () => {
    const candidate = makeCandidate({ event: null });
    renderCard({ candidate });

    expect(screen.getByText(/Event not found/)).toBeDefined();
  });

  it('renders merge and split buttons', () => {
    renderCard();

    const mergeBtn = screen.getByText('Confirm merge with this candidate');
    const splitBtn = screen.getByText('Split (not a duplicate)');
    expect(mergeBtn).toBeDefined();
    expect(splitBtn).toBeDefined();
  });

  it('disables merge button when candidate.event is null', () => {
    const candidate = makeCandidate({ event: null });
    renderCard({ candidate });

    const mergeBtn = screen.getByText('Confirm merge with this candidate');
    expect(mergeBtn.closest('button')!.hasAttribute('disabled')).toBe(true);
  });

  it('does not disable split button when candidate.event is null', () => {
    const candidate = makeCandidate({ event: null });
    renderCard({ candidate });

    const splitBtn = screen.getByText('Split (not a duplicate)');
    expect(splitBtn.closest('button')!.hasAttribute('disabled')).toBe(false);
  });

  it('renders region and category for source event', () => {
    renderCard();
    // The source event summary shows "burlington_area / music"
    const regionCategoryEls = screen.getAllByText('burlington_area / music');
    expect(regionCategoryEls.length).toBeGreaterThanOrEqual(1);
  });
});
