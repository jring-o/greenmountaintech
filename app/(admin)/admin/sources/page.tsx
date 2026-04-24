import Link from 'next/link';

import SourceListActions from '@/components/admin/SourceListActions';
import { listSourcesWithHealth } from '@/lib/db/queries/sources';
import type { SourceWithHealth } from '@/lib/db/queries/sources';
import { cn, formatShortTimestamp } from '@/lib/utils';

function successRate(source: SourceWithHealth): string {
  if (source.runs_30d === 0) return '--';
  const rate = (source.ok_30d / source.runs_30d) * 100;
  return rate.toFixed(0) + '%';
}

function rowHealthClasses(source: SourceWithHealth): string {
  if (!source.is_active) return 'opacity-50 bg-gray-50';
  if (source.consecutive_failures >= 5) return 'bg-red-100';
  if (source.consecutive_failures >= 3) return 'bg-vermont-cream';
  return '';
}

export default async function SourcesPage() {
  const sources = await listSourcesWithHealth();

  return (
    <main>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
          Sources
        </h1>
        <Link
          href="/admin/sources/new"
          className="rounded-lg bg-vermont-forest px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vermont-forest/90"
        >
          + New Source
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-vermont-slate">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Kind</th>
              <th className="pb-2 pr-4 font-medium">Adapter</th>
              <th className="pb-2 pr-4 font-medium">Trust</th>
              <th className="pb-2 pr-4 font-medium text-center">Active</th>
              <th className="pb-2 pr-4 font-medium">Last Run</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium text-right">Failures</th>
              <th className="pb-2 pr-4 font-medium text-right">30d Rate</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-vermont-slate">
                  No sources found. Create one to get started.
                </td>
              </tr>
            )}
            {sources.map((source) => (
              <tr
                key={source.id}
                className={cn('border-b last:border-b-0', rowHealthClasses(source))}
              >
                <td className="py-2 pr-4 font-medium">
                  <Link
                    href={'/admin/sources/' + source.id}
                    className="text-vermont-forest underline-offset-2 hover:underline"
                  >
                    {source.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded bg-vermont-forest/10 px-2 py-0.5 text-xs font-medium text-vermont-forest">
                    {source.kind}
                  </span>
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {source.adapter_type}:{source.adapter_key}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      source.trust_level === 'auto_publish'
                        ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                        : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
                    }
                  >
                    {source.trust_level === 'auto_publish' ? 'Auto' : 'Review'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-center">
                  <SourceListActions sourceId={source.id} isActive={source.is_active} />
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-xs tabular-nums">
                  {formatShortTimestamp(source.last_run_at)}
                </td>
                <td className="py-2 pr-4">
                  {source.last_run_status ? (
                    <span
                      className={
                        source.last_run_status === 'ok'
                          ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
                          : 'rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800'
                      }
                    >
                      {source.last_run_status}
                    </span>
                  ) : (
                    <span className="text-xs text-vermont-slate">--</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {source.consecutive_failures >= 3 ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                      {source.consecutive_failures}
                    </span>
                  ) : (
                    <span className="text-xs">{source.consecutive_failures}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  <span className="text-xs">{successRate(source)}</span>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={'/admin/sources/' + source.id}
                      className="text-xs text-vermont-forest underline-offset-2 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
