import { env } from '@/lib/env';

export default function AboutPage() {
  let contactEmail: string | undefined;
  try {
    contactEmail = env.USER_AGENT_CONTACT;
  } catch {
    // env validation may fail if USER_AGENT_CONTACT is missing or invalid;
    // fall through to the "not configured" UI branch
  }

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        About Vermont Events
      </h1>

      <div className="mt-8 max-w-prose space-y-6 text-vermont-slate">
        <p>
          Vermont Events is a community calendar that gathers and curates local happenings across
          the state. Our goal is to make it easy for Vermonters and visitors to discover concerts,
          craft fairs, town meetings, farm tours, and everything in between — all in one place.
        </p>

        <h2 className="font-display text-xl font-semibold text-vermont-forest">
          How data is gathered
        </h2>
        <p>
          Event listings come from three sources. First, we maintain a curated list of trusted
          Vermont event calendars that are checked automatically on a regular schedule (whitelisted
          scrape). Second, an admin can add new sources on-demand to pull in events from additional
          calendars (admin-added scrape). Third, anyone in the community can submit an event
          directly through our public submission form. Every event, regardless of how it arrives, is
          reviewed before it appears on the calendar.
        </p>

        <h2 className="font-display text-xl font-semibold text-vermont-forest">Contact</h2>
        <p>
          Questions, corrections, or suggestions? Reach us at{' '}
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium text-vermont-accent underline underline-offset-2 transition-colors hover:text-vermont-forest"
            >
              {contactEmail}
            </a>
          ) : (
            <span className="text-muted-foreground">(contact email not configured)</span>
          )}
          .
        </p>
      </div>
    </main>
  );
}
