'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface EventFormData {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  starts_at_utc: string;
  ends_at_utc: string | null;
  tzid: string;
  all_day: boolean;
  venue_name: string | null;
  venue_address: string | null;
  region: string;
  lat: string | null;
  lng: string | null;
  url: string | null;
  image_url: string | null;
  status: string;
  category: string;
  tags: string[];
  merged_into: string | null;
  published_at: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicate' },
];

const CATEGORY_OPTIONS = [
  { value: 'music', label: 'Music' },
  { value: 'arts_theater', label: 'Arts & Theater' },
  { value: 'food_drink', label: 'Food & Drink' },
  { value: 'community_civic', label: 'Community & Civic' },
  { value: 'outdoors_recreation', label: 'Outdoors' },
  { value: 'family_kids', label: 'Family & Kids' },
  { value: 'education_lecture', label: 'Education' },
  { value: 'film', label: 'Film' },
  { value: 'sports', label: 'Sports' },
  { value: 'farmers_market', label: "Farmers' Market" },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'other', label: 'Other' },
];

const REGION_OPTIONS = [
  { value: 'burlington_area', label: 'Burlington Area' },
  { value: 'champlain_valley', label: 'Champlain Valley' },
  { value: 'central_vt', label: 'Central VT' },
  { value: 'northeast_kingdom', label: 'NEK' },
  { value: 'southern_vt', label: 'Southern VT' },
  { value: 'statewide', label: 'Statewide' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Convert ISO datetime to local datetime-local input value */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

/** Convert datetime-local input back to ISO UTC */
function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function EventEditForm({ event }: { event: EventFormData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [startsAtUtc, setStartsAtUtc] = useState(event.starts_at_utc);
  const [endsAtUtc, setEndsAtUtc] = useState(event.ends_at_utc ?? '');
  const [allDay, setAllDay] = useState(event.all_day);
  const [venueName, setVenueName] = useState(event.venue_name ?? '');
  const [venueAddress, setVenueAddress] = useState(event.venue_address ?? '');
  const [region, setRegion] = useState(event.region);
  const [category, setCategory] = useState(event.category);
  const [status, setStatus] = useState(event.status);
  const [eventUrl, setEventUrl] = useState(event.url ?? '');
  const [imageUrl, setImageUrl] = useState(event.image_url ?? '');
  const [tagsStr, setTagsStr] = useState(event.tags.join(', '));

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!startsAtUtc) errs.starts_at_utc = 'Start date is required';
    if (endsAtUtc && new Date(endsAtUtc) < new Date(startsAtUtc)) {
      errs.ends_at_utc = 'End date must be after start date';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    setSuccessMsg(null);
    startTransition(async () => {
      const tags = tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        starts_at_utc: startsAtUtc,
        ends_at_utc: endsAtUtc || null,
        all_day: allDay,
        venue_name: venueName || null,
        venue_address: venueAddress || null,
        region,
        category,
        status,
        url: eventUrl || null,
        image_url: imageUrl || null,
        tags,
      };

      try {
        const res = await fetch(`/api/admin/events/${event.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setSuccessMsg('Event saved successfully.');
          router.refresh();
        } else {
          const json = await res.json();
          setErrors({
            _form: json.error?.message ?? 'Failed to save event',
          });
        }
      } catch {
        setErrors({ _form: 'Network error. Please try again.' });
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/events/${event.id}/reject`, {
          method: 'POST',
        });
        if (res.ok) {
          router.push('/admin/queue');
        }
      } catch {
        setErrors({ _form: 'Failed to reject event.' });
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
        {/* Title */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-vermont-forest/30 bg-background px-3 py-2 text-sm"
          />
        </div>

        {/* Starts At */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Starts At</label>
          <input
            type="datetime-local"
            value={toLocalInput(startsAtUtc)}
            onChange={(e) => setStartsAtUtc(fromLocalInput(e.target.value))}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
          {errors.starts_at_utc && (
            <p className="mt-1 text-xs text-red-600">{errors.starts_at_utc}</p>
          )}
        </div>

        {/* Ends At */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Ends At</label>
          <input
            type="datetime-local"
            value={endsAtUtc ? toLocalInput(endsAtUtc) : ''}
            onChange={(e) => setEndsAtUtc(e.target.value ? fromLocalInput(e.target.value) : '')}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
          {errors.ends_at_utc && <p className="mt-1 text-xs text-red-600">{errors.ends_at_utc}</p>}
        </div>

        {/* All Day */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="all_day"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          <label htmlFor="all_day" className="text-sm font-medium text-vermont-forest">
            All Day Event
          </label>
        </div>

        {/* Status */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Region */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          >
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Venue Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Venue Name</label>
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
        </div>

        {/* Venue Address */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">
            Venue Address
          </label>
          <input
            type="text"
            value={venueAddress}
            onChange={(e) => setVenueAddress(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
        </div>

        {/* URL */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Event URL</label>
          <input
            type="url"
            value={eventUrl}
            onChange={(e) => setEventUrl(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="mb-1 block text-sm font-medium text-vermont-forest">Image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
          />
        </div>

        {/* Tags */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-vermont-forest">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm"
            placeholder="e.g. live-music, outdoor, family-friendly"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t pt-4">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button variant="destructive" onClick={handleReject} disabled={isPending}>
          Soft Delete (Reject)
        </Button>
      </div>
    </div>
  );
}
