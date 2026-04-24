'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import DuplicatePicker from '@/components/admin/DuplicatePicker';
import { Button } from '@/components/ui/button';
import type { AdminEventItem } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const REGION_LABELS: Record<string, string> = {
  burlington_area: 'Burlington Area',
  champlain_valley: 'Champlain Valley',
  central_vt: 'Central VT',
  northeast_kingdom: 'NEK',
  southern_vt: 'Southern VT',
  statewide: 'Statewide',
};

const CATEGORY_LABELS: Record<string, string> = {
  music: 'Music',
  arts_theater: 'Arts & Theater',
  food_drink: 'Food & Drink',
  community_civic: 'Community & Civic',
  outdoors_recreation: 'Outdoors',
  family_kids: 'Family & Kids',
  education_lecture: 'Education',
  film: 'Film',
  sports: 'Sports',
  farmers_market: "Farmers' Market",
  fundraiser: 'Fundraiser',
  other: 'Other',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function truncateEmail(email: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const truncated = local.length > 8 ? local.slice(0, 8) + '...' : local;
  return truncated + '@' + domain;
}

/* ------------------------------------------------------------------ */
/*  Filter bar                                                          */
/* ------------------------------------------------------------------ */

function FilterBar({
  currentQ,
  currentRegion,
  currentCategory,
}: {
  currentQ?: string | undefined;
  currentRegion?: string | undefined;
  currentCategory?: string | undefined;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset cursor when filters change
    params.delete('cursor');
    startTransition(() => {
      router.push('/admin/queue?' + params.toString());
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder="Search events..."
        defaultValue={currentQ ?? ''}
        className="h-8 rounded border border-vermont-forest/30 bg-background px-3 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            updateFilter('q', e.currentTarget.value);
          }
        }}
      />

      <select
        defaultValue={currentRegion ?? ''}
        className="h-8 rounded border border-vermont-forest/30 bg-background px-2 text-sm"
        onChange={(e) => updateFilter('region', e.target.value)}
      >
        <option value="">All regions</option>
        {Object.entries(REGION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        defaultValue={currentCategory ?? ''}
        className="h-8 rounded border border-vermont-forest/30 bg-background px-2 text-sm"
        onChange={(e) => updateFilter('category', e.target.value)}
      >
        <option value="">All categories</option>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {isPending && <span className="text-xs text-vermont-slate">Loading...</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QueueTable                                                          */
/* ------------------------------------------------------------------ */

export default function QueueTable({
  events,
  nextCursor,
  currentQ,
  currentRegion,
  currentCategory,
}: {
  events: AdminEventItem[];
  nextCursor: string | null;
  currentQ?: string | undefined;
  currentRegion?: string | undefined;
  currentCategory?: string | undefined;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [duplicatePickerEventId, setDuplicatePickerEventId] = useState<string | null>(null);

  const allChecked = events.length > 0 && selected.size === events.length;

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(events.map((e) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function bulkAction(action: 'approve' | 'reject') {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
        });

        if (res.ok) {
          setSelected(new Set());
          router.refresh();
        }
      } catch {
        // Silently fail -- user can retry
      }
    });
  }

  function nextPageHref(): string {
    if (!nextCursor) return '#';
    const params = new URLSearchParams(searchParams.toString());
    params.set('cursor', nextCursor);
    return '/admin/queue?' + params.toString();
  }

  return (
    <>
      <FilterBar
        currentQ={currentQ}
        currentRegion={currentRegion}
        currentCategory={currentCategory}
      />

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-vermont-slate">{selected.size} selected</span>
          <Button size="sm" onClick={() => bulkAction('approve')} disabled={isPending}>
            Approve selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => bulkAction('reject')}
            disabled={isPending}
          >
            Reject selected
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-vermont-slate">
              <th className="pb-2 pr-2 font-medium">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="pb-2 pr-4 font-medium">Title</th>
              <th className="pb-2 pr-4 font-medium">Starts</th>
              <th className="pb-2 pr-4 font-medium">Region</th>
              <th className="pb-2 pr-4 font-medium">Category</th>
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">Submitted by</th>
              <th className="pb-2 pr-4 font-medium text-right">Dupes</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-vermont-slate">
                  No pending events.
                </td>
              </tr>
            )}
            {events.map((evt) => (
              <tr key={evt.id} className="border-b last:border-b-0">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={selected.has(evt.id)}
                    onChange={() => toggleOne(evt.id)}
                    aria-label={`Select ${evt.title}`}
                  />
                </td>
                <td className="max-w-[200px] truncate py-2 pr-4 font-medium">{evt.title}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{formatDate(evt.startsAt)}</td>
                <td className="py-2 pr-4">{REGION_LABELS[evt.region] ?? evt.region}</td>
                <td className="py-2 pr-4">{CATEGORY_LABELS[evt.category] ?? evt.category}</td>
                <td className="py-2 pr-4">{evt.sourceName ?? 'Public submission'}</td>
                <td className="py-2 pr-4 text-vermont-slate">
                  {truncateEmail(evt.submitterEmail)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {evt.dedupCandidatesCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      {evt.dedupCandidatesCount}
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    <form action={`/api/admin/events/${evt.id}/approve`} method="POST">
                      <Button type="submit" size="xs" variant="ghost">
                        Approve
                      </Button>
                    </form>
                    <form action={`/api/admin/events/${evt.id}/reject`} method="POST">
                      <Button type="submit" size="xs" variant="ghost">
                        Reject
                      </Button>
                    </form>
                    <Link
                      href={`/admin/queue/${evt.id}`}
                      className="text-xs text-vermont-forest underline-offset-2 hover:underline"
                    >
                      Edit
                    </Link>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setDuplicatePickerEventId(evt.id)}
                    >
                      Dup
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center gap-4">
        {searchParams.get('cursor') && (
          <Link
            href="/admin/queue"
            className="rounded border border-vermont-forest/30 px-3 py-1 text-sm text-vermont-forest hover:bg-vermont-forest/5"
          >
            First page
          </Link>
        )}
        {nextCursor && (
          <Link
            href={nextPageHref()}
            className="rounded border border-vermont-forest/30 px-3 py-1 text-sm text-vermont-forest hover:bg-vermont-forest/5"
          >
            Next page
          </Link>
        )}
      </div>

      {/* Duplicate picker sheet */}
      {duplicatePickerEventId && (
        <DuplicatePicker
          eventId={duplicatePickerEventId}
          onClose={() => setDuplicatePickerEventId(null)}
        />
      )}
    </>
  );
}
