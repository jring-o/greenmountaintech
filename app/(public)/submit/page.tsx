import type { Metadata } from 'next';

import SubmissionForm from '@/components/public/SubmissionForm';

export const metadata: Metadata = {
  title: 'Submit an Event | Vermont Events',
  description:
    'Submit a community event to the Vermont Events calendar. Events are reviewed before publishing.',
};

export default function SubmitPage() {
  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Submit an Event
      </h1>
      <p className="mt-2 max-w-prose text-vermont-slate">
        Share your community event with Vermont. Fill out the form below and your event will be
        reviewed before appearing on the calendar.
      </p>

      <section className="mt-8 max-w-2xl" aria-label="Event submission form">
        <SubmissionForm />
      </section>
    </main>
  );
}
