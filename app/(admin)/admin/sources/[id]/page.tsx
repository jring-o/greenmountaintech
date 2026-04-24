import Link from 'next/link';
import { notFound } from 'next/navigation';

import SourceForm from '@/components/admin/SourceForm';
import type { SourceFormData } from '@/components/admin/SourceForm';
import { getAdapterKeysByType } from '@/lib/adapters/index';
import { getSource, getAuditLogsForSource } from '@/lib/db/queries/sources';

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSource(id);
  if (!source) return notFound();

  const adapterKeys = getAdapterKeysByType();
  const auditLogs = await getAuditLogsForSource(id, 20);

  const formData: SourceFormData = {
    id: source.id,
    name: source.name,
    slug: source.slug,
    kind: source.kind,
    adapter_type: source.adapter_type,
    adapter_key: source.adapter_key,
    url: source.url,
    adapter_config: JSON.stringify(source.adapter_config, null, 2),
    trust_level: source.trust_level,
    is_active: source.is_active,
    contact_url: source.contact_url ?? '',
    rate_limit_per_min: source.rate_limit_per_min,
    robots_respect: source.robots_respect,
  };

  return (
    <main>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/sources"
          className="text-sm text-vermont-forest underline-offset-2 hover:underline"
        >
          &larr; Back to Sources
        </Link>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Edit Source: {source.name}
      </h1>
      <div className="mt-2 flex items-center gap-3 text-sm text-vermont-slate">
        <span className="font-mono text-xs">{source.id}</span>
        <span
          className={
            source.is_active
              ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800'
              : 'rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800'
          }
        >
          {source.is_active ? 'Active' : 'Disabled'}
        </span>
      </div>

      <div className="mt-6">
        <SourceForm initialData={formData} adapterKeys={adapterKeys} mode="edit" />
      </div>

      {/* Audit History */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold tracking-tight text-vermont-forest">
          Audit History
        </h2>
        <div className="mt-4 overflow-x-auto">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-vermont-slate">No audit entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-vermont-slate">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Actor</th>
                  <th className="pb-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs tabular-nums">
                      {entry.created_at.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-vermont-forest/10 px-2 py-0.5 text-xs font-medium text-vermont-forest">
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">{entry.actor_email}</td>
                    <td className="py-2 max-w-xs truncate text-xs font-mono text-vermont-slate">
                      {entry.after ? JSON.stringify(entry.after).slice(0, 100) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
