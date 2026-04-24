import Link from 'next/link';
import { redirect } from 'next/navigation';

import RunStatusBadge from '@/components/admin/RunStatusBadge';
import { listRuns } from '@/lib/db/queries/runs';
import { log } from '@/lib/log';
import { formatDurationMs, formatLocal } from '@/lib/tz';

function formatDate(iso: string): string {
  return formatLocal(new Date(iso), 'America/New_York', 'MMM d, h:mm a');
}

function runDetailHref(runId: string): string {
  return '/admin/runs/' + runId;
}

function nextPageHref(cursorVal: string): string {
  return '/admin/runs?cursor=' + encodeURIComponent(cursorVal);
}

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const cursor = typeof resolved.cursor === 'string' ? resolved.cursor : undefined;

  let runs: Awaited<ReturnType<typeof listRuns>>['runs'];
  let nextCursor: string | null;

  try {
    const page = await listRuns({ ...(cursor !== undefined ? { cursor } : {}), limit: 25 });
    runs = page.runs;
    nextCursor = page.nextCursor;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Invalid cursor: redirect to first page instead of crashing
    if (cursor && message.startsWith('Invalid cursor')) {
      redirect('/admin/runs');
    }
    log.error('Failed to load runs', { error: message });
    throw err;
  }

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Ingestion Runs
      </h1>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-vermont-slate">
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">Started</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium text-right">Found</th>
              <th className="pb-2 pr-4 font-medium text-right">New</th>
              <th className="pb-2 pr-4 font-medium text-right">Updated</th>
              <th className="pb-2 pr-4 font-medium text-right">Errors</th>
              <th className="pb-2 pr-4 font-medium text-right">Duration</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-vermont-slate">
                  No ingestion runs found.
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{run.source_name}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{formatDate(run.started_at)}</td>
                <td className="py-2 pr-4">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{run.items_found}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{run.items_new}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{run.items_updated}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{run.items_errored}</td>
                <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                  {formatDurationMs(run.duration_ms)}
                </td>
                <td className="py-2">
                  <Link
                    href={runDetailHref(run.id)}
                    className="text-vermont-forest underline-offset-2 hover:underline"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="mt-4 flex items-center gap-4">
        {cursor && (
          <Link
            href="/admin/runs"
            className="rounded border border-vermont-forest/30 px-3 py-1 text-sm text-vermont-forest hover:bg-vermont-forest/5"
          >
            First page
          </Link>
        )}
        {nextCursor && (
          <Link
            href={nextPageHref(nextCursor)}
            className="rounded border border-vermont-forest/30 px-3 py-1 text-sm text-vermont-forest hover:bg-vermont-forest/5"
          >
            Next page
          </Link>
        )}
      </div>
    </main>
  );
}
