import DuplicateCard from '@/components/admin/DuplicateCard';
import { listAuditDuplicates, listDuplicateCandidates } from '@/lib/db/queries/duplicates';

export default async function DuplicatesPage() {
  const [pendingRows, auditRows] = await Promise.all([
    listDuplicateCandidates(),
    listAuditDuplicates(),
  ]);

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Duplicates
      </h1>

      {/* -------------------------------------------------------------- */}
      {/*  Pending review (fuzzy candidates)                              */}
      {/* -------------------------------------------------------------- */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-vermont-forest">
          Pending review (fuzzy candidates)
        </h2>

        {pendingRows.length === 0 ? (
          <p className="mt-4 text-vermont-slate">No events pending duplicate review.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {pendingRows.map((row) => (
              <div key={row.id}>
                {row.candidates.map((candidate) => (
                  <DuplicateCard
                    key={`${row.id}-${candidate.event_id}`}
                    eventId={row.id}
                    eventTitle={row.title}
                    eventStartsAt={row.startsAt}
                    eventVenueName={row.venueName}
                    eventRegion={row.region}
                    eventCategory={row.category}
                    candidate={candidate}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------- */}
      {/*  Auto-merged duplicates (audit)                                 */}
      {/* -------------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold text-vermont-forest">
          Auto-merged duplicates (audit)
        </h2>

        {auditRows.length === 0 ? (
          <p className="mt-4 text-vermont-slate">No auto-merged duplicates yet.</p>
        ) : (
          <div className="mt-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-vermont-slate">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Merged Into</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2">{row.title}</td>
                    <td className="py-2 text-vermont-slate">{row.sourceName ?? 'N/A'}</td>
                    <td className="py-2 font-mono text-xs text-vermont-slate">
                      {row.mergedInto ? row.mergedInto.slice(0, 8) + '...' : 'N/A'}
                    </td>
                    <td className="py-2 text-vermont-slate">
                      {new Date(row.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'America/New_York',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
