'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Display labels for enum values                                      */
/* ------------------------------------------------------------------ */

const REGION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'burlington_area', label: 'Burlington Area' },
  { value: 'champlain_valley', label: 'Champlain Valley' },
  { value: 'central_vt', label: 'Central VT' },
  { value: 'northeast_kingdom', label: 'Northeast Kingdom' },
  { value: 'southern_vt', label: 'Southern VT' },
  { value: 'statewide', label: 'Statewide' },
] as const;

const CATEGORY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'music', label: 'Music' },
  { value: 'arts_theater', label: 'Arts & Theater' },
  { value: 'food_drink', label: 'Food & Drink' },
  { value: 'community_civic', label: 'Community & Civic' },
  { value: 'outdoors_recreation', label: 'Outdoors & Recreation' },
  { value: 'family_kids', label: 'Family & Kids' },
  { value: 'education_lecture', label: 'Education & Lectures' },
  { value: 'film', label: 'Film' },
  { value: 'sports', label: 'Sports' },
  { value: 'farmers_market', label: "Farmers' Market" },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'other', label: 'Other' },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function Filters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const region = searchParams.get('region') ?? '';
  const category = searchParams.get('category') ?? '';
  const q = searchParams.get('q') ?? '';

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '/', { scroll: false });
    },
    [router, searchParams],
  );

  const handleReset = useCallback(() => {
    updateParams({ region: '', category: '', q: '' });
  }, [updateParams]);

  const hasFilters = region || category || q;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Region */}
      <label className="flex flex-col gap-1 text-sm text-vermont-slate">
        <span className="font-medium">Region</span>
        <select
          value={region}
          onChange={(e) => updateParams({ region: e.target.value })}
          className="rounded border border-vermont-forest/20 bg-white px-3 py-2 text-sm text-vermont-forest focus:border-vermont-forest focus:outline-none focus:ring-1 focus:ring-vermont-forest"
        >
          <option value="">All regions</option>
          {REGION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* Category */}
      <label className="flex flex-col gap-1 text-sm text-vermont-slate">
        <span className="font-medium">Category</span>
        <select
          value={category}
          onChange={(e) => updateParams({ category: e.target.value })}
          className="rounded border border-vermont-forest/20 bg-white px-3 py-2 text-sm text-vermont-forest focus:border-vermont-forest focus:outline-none focus:ring-1 focus:ring-vermont-forest"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* Search */}
      <label className="flex flex-col gap-1 text-sm text-vermont-slate">
        <span className="font-medium">Search</span>
        <input
          type="search"
          value={q}
          onChange={(e) => updateParams({ q: e.target.value })}
          placeholder="Search events..."
          className="rounded border border-vermont-forest/20 bg-white px-3 py-2 text-sm text-vermont-forest placeholder:text-vermont-slate/50 focus:border-vermont-forest focus:outline-none focus:ring-1 focus:ring-vermont-forest"
        />
      </label>

      {/* Reset */}
      {hasFilters ? (
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-vermont-forest/20 bg-white px-3 py-2 text-sm font-medium text-vermont-slate transition-colors hover:bg-vermont-forest/5 hover:text-vermont-forest"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
