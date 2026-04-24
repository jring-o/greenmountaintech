'use client';

import Link from 'next/link';

export default function PublicError({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-vermont-slate">
        An unexpected error occurred. Please try again, or return to the home page.
      </p>
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-vermont-forest px-4 py-2 text-sm font-medium text-vermont-cream transition-colors hover:bg-vermont-forest/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-vermont-forest/20 px-4 py-2 text-sm font-medium text-vermont-forest transition-colors hover:bg-vermont-forest/5"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
