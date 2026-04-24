'use client';

export default function AdminError({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight text-vermont-forest">
        Admin Error
      </h1>
      <p className="mt-4 max-w-md text-vermont-slate">
        Something went wrong in the admin area. Please try again or return to the dashboard.
      </p>
      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-vermont-forest px-4 py-2 text-sm font-medium text-vermont-cream transition-colors hover:bg-vermont-forest/90"
        >
          Try again
        </button>
        <a
          href="/admin"
          className="rounded-md border border-vermont-forest/20 px-4 py-2 text-sm font-medium text-vermont-forest transition-colors hover:bg-vermont-forest/5"
        >
          Go to dashboard
        </a>
      </div>
    </main>
  );
}
