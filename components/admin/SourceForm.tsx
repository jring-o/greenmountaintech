'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SourceFormData {
  id?: string;
  name: string;
  slug: string;
  kind: string;
  adapter_type: string;
  adapter_key: string;
  url: string;
  adapter_config: string; // JSON string
  trust_level: string;
  is_active: boolean;
  contact_url: string;
  rate_limit_per_min: number;
  robots_respect: boolean;
}

interface SourceFormProps {
  initialData?: SourceFormData;
  adapterKeys: Record<string, string[]>;
  mode: 'create' | 'edit';
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const KIND_OPTIONS = [
  { value: 'whitelist', label: 'Whitelist' },
  { value: 'admin_added', label: 'Admin Added' },
];

const ADAPTER_TYPE_OPTIONS = [
  { value: 'ical', label: 'iCal' },
  { value: 'rss', label: 'RSS' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
];

const TRUST_LEVEL_OPTIONS = [
  { value: 'auto_publish', label: 'Auto-publish' },
  { value: 'review', label: 'Review' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function SourceForm({ initialData, adapterKeys, mode }: SourceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');

  // Form state
  const [name, setName] = useState(initialData?.name ?? '');
  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [kind, setKind] = useState(initialData?.kind ?? 'whitelist');
  const [adapterType, setAdapterType] = useState(initialData?.adapter_type ?? 'ical');
  const [adapterKey, setAdapterKey] = useState(initialData?.adapter_key ?? 'generic');
  const [sourceUrl, setSourceUrl] = useState(initialData?.url ?? '');
  const [adapterConfig, setAdapterConfig] = useState(initialData?.adapter_config ?? '{}');
  const [trustLevel, setTrustLevel] = useState(initialData?.trust_level ?? 'review');
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [contactUrl, setContactUrl] = useState(initialData?.contact_url ?? '');
  const [rateLimitPerMin, setRateLimitPerMin] = useState(initialData?.rate_limit_per_min ?? 30);
  const [robotsRespect, setRobotsRespect] = useState(initialData?.robots_respect ?? true);

  // Auto-derive slug from name (only on create and if user hasn't manually edited)
  useEffect(() => {
    if (!slugEdited && mode === 'create') {
      setSlug(slugify(name));
    }
  }, [name, slugEdited, mode]);

  // Compute available adapter keys for selected adapter_type
  const availableKeys = adapterKeys[adapterType] ?? ['generic'];

  // When adapter_type changes, reset adapter_key to the first available
  useEffect(() => {
    const keys = adapterKeys[adapterType] ?? ['generic'];
    if (!keys.includes(adapterKey)) {
      setAdapterKey(keys[0] ?? 'generic');
    }
  }, [adapterType, adapterKeys, adapterKey]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!slug.trim()) errs.slug = 'Slug is required';
    if (!/^[a-z0-9-]+$/.test(slug)) {
      errs.slug = 'Slug must be lowercase alphanumeric with hyphens';
    }
    if (!sourceUrl.trim()) errs.url = 'URL is required';

    // Validate JSON
    try {
      JSON.parse(adapterConfig);
    } catch {
      errs.adapter_config = 'Invalid JSON';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildPayload(config: Record<string, unknown>): Record<string, unknown> {
    return {
      name,
      slug,
      kind,
      adapter_type: adapterType,
      adapter_key: adapterKey,
      url: sourceUrl,
      adapter_config: config,
      trust_level: trustLevel,
      is_active: isActive,
      contact_url: contactUrl || null,
      rate_limit_per_min: rateLimitPerMin,
      robots_respect: robotsRespect,
    };
  }

  function handleSave() {
    if (!validate()) return;

    setSuccessMsg(null);
    setErrors({});
    startTransition(async () => {
      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = JSON.parse(adapterConfig);
      } catch {
        setErrors({ adapter_config: 'Invalid JSON' });
        return;
      }

      const payload = buildPayload(parsedConfig);

      try {
        const endpoint =
          mode === 'create' ? '/api/admin/sources' : `/api/admin/sources/${initialData?.id}`;
        const method = mode === 'create' ? 'POST' : 'PATCH';

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const json = await res.json();
          if (mode === 'create') {
            router.push(`/admin/sources/${json.data.id}`);
          } else {
            setSuccessMsg('Source saved successfully.');
            router.refresh();
          }
        } else {
          const json = await res.json();
          setErrors({
            _form: json.error?.message ?? 'Failed to save source',
          });
        }
      } catch {
        setErrors({ _form: 'Network error. Please try again.' });
      }
    });
  }

  function handleRunNow() {
    if (!initialData?.id) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sources/${initialData.id}/run`, { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          setSuccessMsg(
            `Run completed: ${json.data.status} -- ${json.data.itemsFound} found, ${json.data.itemsNew} new`,
          );
          router.refresh();
        } else {
          const json = await res.json();
          setErrors({
            _form: json.error?.message ?? 'Run failed',
          });
        }
      } catch {
        setErrors({ _form: 'Network error during run.' });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Form-level errors */}
      {errors._form && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errors._form}
        </div>
      )}
      {successMsg && (
        <div className="rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Name */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
            placeholder="e.g. Burlington Free Press Events"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>

        {/* Slug */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 font-mono text-sm"
            placeholder="e.g. burlington-free-press"
          />
          {errors.slug && <p className="mt-1 text-xs text-red-600">{errors.slug}</p>}
        </div>

        {/* Kind */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Trust Level */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Trust Level</label>
          <select
            value={trustLevel}
            onChange={(e) => setTrustLevel(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {TRUST_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Adapter Type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Adapter Type</label>
          <select
            value={adapterType}
            onChange={(e) => setAdapterType(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {ADAPTER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Adapter Key */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Adapter Key</label>
          <select
            value={adapterKey}
            onChange={(e) => setAdapterKey(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {availableKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        {/* URL */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">URL</label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
            placeholder="https://example.com/events.ics"
          />
          {errors.url && <p className="mt-1 text-xs text-red-600">{errors.url}</p>}
        </div>

        {/* Adapter Config (JSON) */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">
            Adapter Config (JSON)
          </label>
          <textarea
            value={adapterConfig}
            onChange={(e) => setAdapterConfig(e.target.value)}
            rows={4}
            className="w-full rounded border border-vermont-forest/30 bg-background px-3 py-2 font-mono text-sm"
            placeholder="{}"
          />
          {errors.adapter_config && (
            <p className="mt-1 text-xs text-red-600">{errors.adapter_config}</p>
          )}
        </div>

        {/* Contact URL */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Contact URL</label>
          <input
            type="url"
            value={contactUrl}
            onChange={(e) => setContactUrl(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
            placeholder="https://example.com/contact"
          />
        </div>

        {/* Rate Limit */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">
            Rate Limit (req/min)
          </label>
          <input
            type="number"
            value={rateLimitPerMin}
            onChange={(e) => setRateLimitPerMin(parseInt(e.target.value, 10) || 30)}
            min={1}
            max={600}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
        </div>

        {/* Robots Respect */}
        <div className="flex items-center gap-2 self-end pb-1">
          <input
            type="checkbox"
            id="robots_respect"
            checked={robotsRespect}
            onChange={(e) => setRobotsRespect(e.target.checked)}
          />
          <label htmlFor="robots_respect" className="text-sm font-medium text-vermont-forest">
            Respect robots.txt
          </label>
        </div>

        {/* Is Active */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="is_active" className="text-sm font-medium text-vermont-forest">
            Active
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t pt-4">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving...' : mode === 'create' ? 'Create Source' : 'Save Changes'}
        </Button>
        {mode === 'edit' && initialData?.id && (
          <Button variant="outline" onClick={handleRunNow} disabled={isPending}>
            {isPending ? 'Running...' : 'Run Now'}
          </Button>
        )}
      </div>
    </div>
  );
}
