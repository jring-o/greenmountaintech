'use client';

import type { DatesSetArg, EventClickArg, EventSourceFunc } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';

import type { PublicEventItem } from '@/lib/db/queries/events-schema';

import EventCard from './EventCard';

/* ------------------------------------------------------------------ */
/*  View key ↔ FullCalendar view name mapping                          */
/* ------------------------------------------------------------------ */

const VIEW_MAP: Record<string, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
  list: 'listMonth',
};

const VIEW_MAP_REVERSE: Record<string, string> = {
  dayGridMonth: 'month',
  timeGridWeek: 'week',
  timeGridDay: 'day',
  listMonth: 'list',
};

/* ------------------------------------------------------------------ */
/*  Calendar component                                                  */
/* ------------------------------------------------------------------ */

interface CalendarProps {
  initialView?: string | undefined;
  initialDate?: string | undefined;
}

export default function Calendar({ initialView, initialDate }: CalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipNextDatesSet = useRef(true);

  const fcView = (initialView && VIEW_MAP[initialView]) || 'dayGridMonth';

  /* ---------------------------------------------------------------- */
  /*  Events fetch callback                                            */
  /* ---------------------------------------------------------------- */

  const fetchEvents: EventSourceFunc = useCallback(
    (info, successCallback, failureCallback) => {
      const params = new URLSearchParams();
      params.set('from', info.startStr);
      params.set('to', info.endStr);
      params.set('limit', '500');

      const region = searchParams.get('region');
      const category = searchParams.get('category');
      const q = searchParams.get('q');

      if (region) params.set('region', region);
      if (category) params.set('category', category);
      if (q) params.set('q', q);

      fetch(`/api/public/events?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ events: PublicEventItem[] }>;
        })
        .then((data) => {
          const mapped = data.events.map((evt) => {
            const base = {
              id: evt.id,
              title: evt.title,
              start: evt.startsAt,
              allDay: evt.allDay,
              backgroundColor: '#2D5F2D',
              borderColor: '#2D5F2D',
              extendedProps: {
                eventId: evt.id,
                venueName: evt.venueName,
                region: evt.region,
                category: evt.category,
                tags: evt.tags,
              },
            };
            if (evt.endsAt) {
              return { ...base, end: evt.endsAt };
            }
            return base;
          });
          successCallback(mapped);
        })
        .catch((err: unknown) => {
          failureCallback(err instanceof Error ? err : new Error(String(err)));
        });
    },
    [searchParams],
  );

  /* ---------------------------------------------------------------- */
  /*  URL sync on view/date change                                     */
  /* ---------------------------------------------------------------- */

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      // Skip the initial mount call to avoid overwriting the URL on first render
      if (skipNextDatesSet.current) {
        skipNextDatesSet.current = false;
        return;
      }

      const params = new URLSearchParams(searchParams.toString());

      const viewKey = VIEW_MAP_REVERSE[arg.view.type] ?? arg.view.type;
      if (viewKey !== 'month') {
        params.set('view', viewKey);
      } else {
        params.delete('view');
      }

      // Use the view's current date (start of the visible range isn't always
      // the best representation; FullCalendar's currentStart is the first day
      // of the month/week/day view).
      const dateStr = arg.view.currentStart.toISOString().slice(0, 10);
      params.set('date', dateStr);

      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '/', { scroll: false });
    },
    [router, searchParams],
  );

  /* ---------------------------------------------------------------- */
  /*  Event click → navigate to detail page                            */
  /* ---------------------------------------------------------------- */

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      info.jsEvent.preventDefault();
      const eventId = info.event.extendedProps.eventId as string;
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <div className="vermont-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={fcView}
        {...(initialDate ? { initialDate } : {})}
        events={fetchEvents}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        eventContent={(arg) => <EventCard event={arg} />}
        eventDisplay="block"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
        }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day',
          list: 'List',
        }}
        height="auto"
        dayMaxEvents={4}
        nowIndicator
        fixedWeekCount={false}
      />
    </div>
  );
}
