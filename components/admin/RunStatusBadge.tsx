import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  ok: {
    label: 'OK',
    className: 'bg-vermont-forest/15 text-vermont-forest border-vermont-forest/30',
  },
  partial: {
    label: 'Partial',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
  running: {
    label: 'Running',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

const fallbackConfig = {
  label: 'Unknown',
  className: 'bg-gray-100 text-gray-600 border-gray-300',
};

export default function RunStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? fallbackConfig;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
