import Link from 'next/link';
import { notFound } from 'next/navigation';

import RunStatusBadge from '@/components/admin/RunStatusBadge';
import { getRunWithItems } from '@/lib/db/queries/runs';
import { formatDurationMs, formatLocal } from '@/lib/tz';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(date: Date): string {
  return formatLocal(date, 'America/New_York', 'MMM d, yyyy h:mm:ss a');
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Validate UUID before hitting the database
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getRunWithItems(id);

  if (!detail) {
    notFound();
  }

  const { run, source, items } = detail;
  const errorLog = (run.error_log ?? []) as Array<{ message: string; ts: string }>;

  return (
    <main>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/runs" className="text-sm text-vermont-slate hover:text-vermont-forest">
          &larr; Runs
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
          {source ? source.name : 'Unknown Source'}
        </h1>
        <RunStatusBadge status={run.status} />
        <span className="text-sm text-vermont-slate">{formatDurationMs(run.duration_ms)}</span>
      </div>

      <p className="mt-1 text-sm text-vermont-slate">
        Started {formatDate(run.started_at)}
        {run.finished_at ? ' \u2014 Finished ' + formatDate(run.finished_at) : ''}
      </p>

      {/* Counters card */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <CounterCard label="Found" value={run.items_found} />
        <CounterCard label="New" value={run.items_new} />
        <CounterCard label="Updated" value={run.items_updated} />
        <CounterCard label="Errored" value={run.items_errored} />
        <CounterCard label="Dedup Skipped" value={run.items_dedup_skipped} />
      </div>

      {/* Error log */}
      {errorLog.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-vermont-forest">Error Log</h2>
          <div className="mt-2 space-y-2">
            {errorLog.map((entry, idx) => (
              <details key={idx} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-red-800">
                  {entry.ts ? new Date(entry.ts).toISOString() : 'Error ' + (idx + 1)}
                </summary>
                <pre className="mt-2 overflow-x-auto text-xs text-red-700 whitespace-pre-wrap">
                  {JSON.stringify(entry, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-vermont-forest">Items (last 50)</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-vermont-slate">
                <th className="pb-2 pr-4 font-medium">Title</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-vermont-slate">
                    No items for this run.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{item.title}</td>
                  <td className="py-2 pr-4">
                    <RunStatusBadge status={item.status} />
                  </td>
                  <td className="py-2 whitespace-nowrap">{item.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function CounterCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-vermont-slate uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-vermont-forest">{value}</p>
    </div>
  );
}
