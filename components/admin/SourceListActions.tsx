'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface SourceListActionsProps {
  sourceId: string;
  isActive: boolean;
}

export default function SourceListActions({ sourceId, isActive }: SourceListActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(isActive);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  function handleToggle() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sources/${sourceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !active }),
        });
        if (res.ok) {
          setActive(!active);
          router.refresh();
        }
      } catch {
        // silently ignore
      }
    });
  }

  function handleRunNow() {
    setRunMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sources/${sourceId}/run`, {
          method: 'POST',
        });
        if (res.ok) {
          const json = await res.json();
          setRunMsg(
            `${json.data.status}: ${json.data.itemsFound} found, ${json.data.itemsNew} new`,
          );
          router.refresh();
        } else {
          const json = await res.json();
          setRunMsg(json.error?.message ?? 'Run failed');
        }
      } catch {
        setRunMsg('Network error');
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            active ? 'bg-vermont-forest' : 'bg-gray-300'
          } ${isPending ? 'opacity-50' : ''}`}
          role="switch"
          aria-checked={active}
          aria-label={active ? 'Disable source' : 'Enable source'}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
              active ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={isPending}
          className="rounded border border-vermont-forest/30 px-2 py-0.5 text-xs text-vermont-forest transition-colors hover:bg-vermont-forest/5 disabled:opacity-50"
        >
          Run
        </button>
      </div>
      {runMsg && (
        <span className="max-w-[200px] truncate text-xs text-vermont-slate">{runMsg}</span>
      )}
    </div>
  );
}
