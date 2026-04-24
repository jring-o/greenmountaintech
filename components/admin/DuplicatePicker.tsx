'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { AdminEventItem } from '@/lib/db/queries/events-schema';

/* ------------------------------------------------------------------ */
/*  DuplicatePicker                                                     */
/* ------------------------------------------------------------------ */

export default function DuplicatePicker({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminEventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, startMerge] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          '/api/admin/events?status=published&q=' + encodeURIComponent(query) + '&limit=10',
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.data?.events ?? []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleMerge(targetId: string) {
    startMerge(async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId }),
        });
        if (res.ok) {
          onClose();
          router.refresh();
        }
      } catch {
        // ignore
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close duplicate picker"
      />

      {/* Sheet panel */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-vermont-forest">Mark duplicate of...</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            X
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <input
            type="search"
            placeholder="Search published events..."
            className="h-8 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading && <p className="py-4 text-center text-sm text-vermont-slate">Searching...</p>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-sm text-vermont-slate">
              No published events found.
            </p>
          )}
          {results.map((evt) => (
            <div
              key={evt.id}
              className="flex items-center justify-between border-b py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{evt.title}</p>
                <p className="text-xs text-vermont-slate">
                  {new Date(evt.startsAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'America/New_York',
                  })}
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => handleMerge(evt.id)}
                disabled={merging}
              >
                Select
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
