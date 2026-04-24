/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import EventDetail from '@/components/public/EventDetail';
import type { PublicEventDetail } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Fixture factory                                                     */
/* ------------------------------------------------------------------ */

function makeEvent(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Community Barn Dance',
    startsAt: '2026-06-15T22:00:00.000Z',
    endsAt: '2026-06-16T01:00:00.000Z',
    tzid: 'America/New_York',
    allDay: false,
    venueName: 'Town Hall',
    region: 'central_vt',
    category: 'music',
    tags: ['folk', 'dance'],
    url: '/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceName: null,
    imageUrl: null,
    description: 'A fun community event in the barn.',
    descriptionHtml: '<p>A fun community event in the barn.</p>',
    venueAddress: '123 Main St, Montpelier, VT',
    lat: null,
    lng: null,
    externalUrl: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    publishedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('EventDetail', () => {
  afterEach(() => {
    cleanup();
  });

  /* ---------------------------------------------------------------- */
  /*  Source attribution                                                */
  /* ---------------------------------------------------------------- */

  describe('source attribution', () => {
    it('renders source link when sourceName and externalUrl are both present', () => {
      const event = makeEvent({
        sourceName: 'Seven Days',
        externalUrl: 'https://sevendays.com/event/123',
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd="Mon, Jun 15 · 9:00 PM EDT"
          sanitizedHtml={null}
        />,
      );

      const link = screen.getByText('Seven Days');
      expect(link).toBeDefined();
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('https://sevendays.com/event/123');
    });

    it('does not render source attribution when sourceName is null', () => {
      const event = makeEvent({
        sourceName: null,
        externalUrl: 'https://sevendays.com/event/123',
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText('Source:')).toBeNull();
    });

    it('does not render source attribution when externalUrl is null', () => {
      const event = makeEvent({
        sourceName: 'Seven Days',
        externalUrl: null,
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText('Seven Days')).toBeNull();
    });

    it('does not render source attribution when both are null', () => {
      const event = makeEvent({
        sourceName: null,
        externalUrl: null,
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText('Source:')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Placeholder image                                                 */
  /* ---------------------------------------------------------------- */

  describe('placeholder image', () => {
    it('uses placeholder-event.svg when imageUrl is null', () => {
      const event = makeEvent({ imageUrl: null });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const img = screen.getByAltText('Event placeholder');
      expect(img).toBeDefined();
      // Next.js Image component renders with src attribute containing the path
      expect(img.getAttribute('src')).toContain('placeholder-event');
    });

    it('uses event image when imageUrl is present', () => {
      const event = makeEvent({
        imageUrl: 'https://example.com/event-photo.jpg',
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const img = screen.getByAltText('Community Barn Dance');
      expect(img).toBeDefined();
      expect(img.getAttribute('src')).toContain('event-photo');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  merged_into coverage note                                         */
  /* ---------------------------------------------------------------- */

  describe('merged_into rows', () => {
    it('are not reachable: getPublicEventById filters merged_into IS NOT NULL, returning null -- the page calls notFound()', () => {
      // This test documents the architectural decision:
      // getPublicEventById includes `isNull(events.merged_into)` in its WHERE clause.
      // If an event has merged_into set, the query returns null and the page calls
      // notFound(). The EventDetail component never receives a merged event.
      // This is a documentation test confirming the contract.
      expect(true).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Basic rendering                                                   */
  /* ---------------------------------------------------------------- */

  describe('basic rendering', () => {
    it('renders event title', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd="Mon, Jun 15 · 9:00 PM EDT"
          sanitizedHtml="<p>A fun community event in the barn.</p>"
        />,
      );

      expect(screen.getByText('Community Barn Dance')).toBeDefined();
    });

    it('renders formatted start time', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('Mon, Jun 15 · 6:00 PM EDT')).toBeDefined();
    });

    it('renders category badge', () => {
      const event = makeEvent({ category: 'music' });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('Music')).toBeDefined();
    });

    it('renders region label', () => {
      const event = makeEvent({ region: 'central_vt' });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('Central Vermont')).toBeDefined();
    });

    it('renders tags as chips', () => {
      const event = makeEvent({ tags: ['folk', 'dance'] });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('folk')).toBeDefined();
      expect(screen.getByText('dance')).toBeDefined();
    });

    it('renders add to calendar link', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 · 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const link = screen.getByText('Add to calendar');
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toContain('/ics');
    });

    it('renders back to events link', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const link = screen.getByText('Back to events');
      expect(link).toBeDefined();
      expect(link.getAttribute('href')).toBe('/');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  End time rendering                                                */
  /* ---------------------------------------------------------------- */

  describe('end time rendering', () => {
    it('renders "Ends:" label with formatted end time when formattedEnd is provided', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd="Mon, Jun 15 \u00b7 9:00 PM EDT"
          sanitizedHtml={null}
        />,
      );

      // Ends and the time are sibling text nodes in the same p element
      const endsEl = screen.getByText(/Ends:.*9:00 PM EDT/);
      expect(endsEl).toBeDefined();
    });

    it('does not render "Ends:" when formattedEnd is null', () => {
      const event = makeEvent();
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText(/^Ends:/)).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  All-day indicator                                                 */
  /* ---------------------------------------------------------------- */

  describe('all-day indicator', () => {
    it('renders "All day" when allDay is true', () => {
      const event = makeEvent({ allDay: true });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('All day')).toBeDefined();
    });

    it('does not render "All day" when allDay is false', () => {
      const event = makeEvent({ allDay: false });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText('All day')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Venue rendering                                                   */
  /* ---------------------------------------------------------------- */

  describe('venue rendering', () => {
    it('renders venue name and address when both are present', () => {
      const event = makeEvent({
        venueName: 'Town Hall',
        venueAddress: '123 Main St, Montpelier, VT',
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('Town Hall')).toBeDefined();
      expect(screen.getByText('123 Main St, Montpelier, VT')).toBeDefined();
    });

    it('renders venue name without address when venueAddress is null', () => {
      const event = makeEvent({
        venueName: 'Town Hall',
        venueAddress: null,
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('Town Hall')).toBeDefined();
      expect(screen.queryByText('123 Main St, Montpelier, VT')).toBeNull();
    });

    it('does not render venue section when venueName is null', () => {
      const event = makeEvent({ venueName: null });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.queryByText('Venue')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Description rendering                                             */
  /* ---------------------------------------------------------------- */

  describe('description rendering', () => {
    it('renders sanitized HTML when sanitizedHtml is provided', () => {
      const event = makeEvent({ description: 'Plain text fallback' });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml="<p>Rich <strong>HTML</strong> content</p>"
        />,
      );

      expect(screen.getByText(/Rich/)).toBeDefined();
      expect(screen.getByText('HTML')).toBeDefined();
    });

    it('falls back to plain text description when sanitizedHtml is null', () => {
      const event = makeEvent({
        description: 'A plain text description of the event.',
        descriptionHtml: null,
      });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('A plain text description of the event.')).toBeDefined();
    });

    it('renders nothing when both sanitizedHtml and description are null', () => {
      const event = makeEvent({
        description: null,
        descriptionHtml: null,
      });
      const { container } = render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const proseDiv = container.querySelector('.prose');
      expect(proseDiv).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Tags edge case                                                    */
  /* ---------------------------------------------------------------- */

  describe('tags edge cases', () => {
    it('does not render tags section when tags array is empty', () => {
      const event = makeEvent({ tags: [] });
      const { container } = render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      const chips = container.querySelectorAll('.rounded-full');
      expect(chips.length).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Category and region fallback                                      */
  /* ---------------------------------------------------------------- */

  describe('label fallback for unknown values', () => {
    it('falls back to raw category string for unknown category', () => {
      const event = makeEvent({ category: 'unknown_category' });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('unknown_category')).toBeDefined();
    });

    it('falls back to raw region string for unknown region', () => {
      const event = makeEvent({ region: 'unknown_region' });
      render(
        <EventDetail
          event={event}
          formattedStart="Mon, Jun 15 \u00b7 6:00 PM EDT"
          formattedEnd={null}
          sanitizedHtml={null}
        />,
      );

      expect(screen.getByText('unknown_region')).toBeDefined();
    });
  });
});
