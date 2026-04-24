import { ImageResponse } from 'next/og';

import { getPublicEventById } from '@/lib/db/queries/events';
import { formatLocal } from '@/lib/tz';

/* ------------------------------------------------------------------ */
/*  OG image config                                                     */
/* ------------------------------------------------------------------ */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Event details';

/* ------------------------------------------------------------------ */
/*  Route handler                                                       */
/* ------------------------------------------------------------------ */

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getPublicEventById(id);

  if (!event) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2D5F2D',
          color: '#FAF7F2',
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        Event Not Found
      </div>,
      { ...size },
    );
  }

  // eslint-disable-next-line no-restricted-syntax
  const startDate = new Date(event.startsAt);
  const formattedDate = formatLocal(startDate, event.tzid, 'EEEE, MMMM d, yyyy');
  const formattedTime = formatLocal(startDate, event.tzid, 'h:mm a zzz');

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#2D5F2D',
        padding: '60px',
        position: 'relative',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          backgroundColor: '#4A5568',
          display: 'flex',
        }}
      />

      {/* Header label */}
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          fontWeight: 600,
          color: '#FAF7F2',
          opacity: 0.7,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          marginBottom: '24px',
        }}
      >
        Vermont Events
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          fontSize: event.title.length > 60 ? 42 : 56,
          fontWeight: 700,
          color: '#FAF7F2',
          lineHeight: 1.2,
          marginBottom: '32px',
          maxHeight: '280px',
          overflow: 'hidden',
        }}
      >
        {event.title}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, display: 'flex' }} />

      {/* Date and time */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 600,
            color: '#FAF7F2',
          }}
        >
          {formattedDate}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#FAF7F2',
            opacity: 0.8,
          }}
        >
          {formattedTime}
        </div>
      </div>

      {/* Bottom accent */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '80px',
          background: 'linear-gradient(to top, rgba(74, 85, 104, 0.3), transparent)',
          display: 'flex',
        }}
      />
    </div>,
    { ...size },
  );
}
