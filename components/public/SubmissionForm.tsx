'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import Honeypot from '@/components/public/Honeypot';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Display labels for enum values                                      */
/* ------------------------------------------------------------------ */

const REGION_OPTIONS = [
  { value: 'burlington_area', label: 'Burlington Area' },
  { value: 'champlain_valley', label: 'Champlain Valley' },
  { value: 'central_vt', label: 'Central VT' },
  { value: 'northeast_kingdom', label: 'Northeast Kingdom' },
  { value: 'southern_vt', label: 'Southern VT' },
  { value: 'statewide', label: 'Statewide' },
] as const;

const CATEGORY_OPTIONS = [
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
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface FieldError {
  path: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse comma-separated tags into a normalized array:
 * trimmed, lowercased, de-duped, empties removed.
 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of raw.split(',')) {
    const trimmed = t.trim().toLowerCase();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Client-side validation                                              */
/* ------------------------------------------------------------------ */

interface FormState {
  title: string;
  description: string;
  startsAtLocal: string;
  endsAtLocal: string;
  allDay: boolean;
  venueName: string;
  venueAddress: string;
  region: string;
  category: string;
  tagsRaw: string;
  url: string;
  imageUrl: string;
  submitterEmail: string;
}

function validateClient(state: FormState): Record<string, string> {
  const errs: Record<string, string> = {};

  if (state.title.trim().length < 3) {
    errs.title = 'Title must be at least 3 characters';
  }
  if (state.title.length > 300) {
    errs.title = 'Title must be at most 300 characters';
  }
  if (!state.startsAtLocal) {
    errs.startsAtLocal = 'Start date is required';
  }
  if (state.endsAtLocal && state.startsAtLocal && state.endsAtLocal < state.startsAtLocal) {
    errs.endsAtLocal = 'End must be after start';
  }
  if (!state.region) {
    errs.region = 'Region is required';
  }
  if (!state.category) {
    errs.category = 'Category is required';
  }
  if (!state.submitterEmail) {
    errs.submitterEmail = 'Contact email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.submitterEmail)) {
    errs.submitterEmail = 'Enter a valid email address';
  }
  if (state.url && !/^https?:\/\/.+/.test(state.url)) {
    errs.url = 'URL must start with http:// or https://';
  }
  if (state.imageUrl && !/^https?:\/\/.+/.test(state.imageUrl)) {
    errs.imageUrl = 'Image URL must start with http:// or https://';
  }
  const tags = parseTags(state.tagsRaw);
  if (tags.length > 12) {
    errs.tagsRaw = 'Maximum 12 tags allowed';
  }
  if (state.description.length > 5000) {
    errs.description = 'Description must be at most 5000 characters';
  }

  return errs;
}

/* ------------------------------------------------------------------ */
/*  Styles (shared)                                                     */
/* ------------------------------------------------------------------ */

const fieldClasses =
  'h-9 w-full rounded border border-vermont-forest/30 bg-background px-3 text-sm focus:border-vermont-forest focus:outline-none focus:ring-1 focus:ring-vermont-forest';
const labelClasses = 'mb-1 block text-sm font-medium text-vermont-forest';
const errorClasses = 'mt-1 text-xs text-red-600';

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function SubmissionForm() {
  /* ── Anti-spam hidden fields ────────────────────────────────────── */
  const [clientStartedAt, setClientStartedAt] = useState('');
  const [hpUrl, setHpUrl] = useState('');
  const didInit = useRef(false);

  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      setClientStartedAt(new Date().toISOString());
    }
  }, []);

  /* ── Form state ─────────────────────────────────────────────────── */
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');

  /* ── UI state ───────────────────────────────────────────────────── */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* ── Submit handler ─────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const formState: FormState = {
      title,
      description,
      startsAtLocal,
      endsAtLocal,
      allDay,
      venueName,
      venueAddress,
      region,
      category,
      tagsRaw,
      url,
      imageUrl,
      submitterEmail,
    };

    const clientErrors = validateClient(formState);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      // When allDay is true, <input type="date"> produces "YYYY-MM-DD" but the
      // server schema requires ISO local datetime "YYYY-MM-DDTHH:mm:ss". Append
      // T00:00:00 so validation passes.
      const startsAtLocalValue =
        allDay && startsAtLocal && !startsAtLocal.includes('T')
          ? `${startsAtLocal}T00:00:00`
          : startsAtLocal;

      const body: Record<string, unknown> = {
        title: title.trim(),
        startsAtLocal: startsAtLocalValue,
        allDay,
        region,
        category,
        submitterEmail: submitterEmail.trim(),
        clientStartedAt,
        hp_url: hpUrl,
        tags: parseTags(tagsRaw),
      };
      if (description.trim()) body.description = description.trim();
      if (endsAtLocal) body.endsAtLocal = endsAtLocal;
      if (venueName.trim()) body.venueName = venueName.trim();
      if (venueAddress.trim()) body.venueAddress = venueAddress.trim();
      if (url.trim()) body.url = url.trim();
      if (imageUrl.trim()) body.imageUrl = imageUrl.trim();

      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        setSubmitted(true);
        return;
      }

      if (res.status === 422 || res.status === 429) {
        const json = (await res.json()) as {
          ok: boolean;
          error: { code: string; message: string; details?: FieldError[] };
        };

        const serverErrors: Record<string, string> = {
          _form: json.error.message,
        };

        if (json.error.details) {
          for (const d of json.error.details) {
            serverErrors[d.path] = d.message;
          }
        }

        setErrors(serverErrors);
        return;
      }

      setErrors({ _form: 'An unexpected error occurred. Please try again.' });
    } catch {
      setErrors({ _form: 'Network error. Please check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Thank-you screen ───────────────────────────────────────────── */
  if (submitted) {
    return (
      <div data-testid="thank-you" className="space-y-4 text-center">
        <h2 className="font-display text-2xl font-bold text-vermont-forest">Thank you!</h2>
        <p className="text-vermont-slate">
          Your event has been submitted for review. Once approved it will appear on the calendar.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="rounded border border-vermont-forest/30 bg-white px-4 py-2 text-sm font-medium text-vermont-forest transition-colors hover:bg-vermont-forest/5"
          >
            Back to calendar
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-vermont-forest px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-vermont-forest/90"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  /* ── Form ────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Form-level error */}
      {errors._form && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {errors._form}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Title */}
        <div className="sm:col-span-2">
          <label htmlFor="sf-title" className={labelClasses}>
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="sf-title"
            type="text"
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClasses}
          />
          {errors.title && <p className={errorClasses}>{errors.title}</p>}
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label htmlFor="sf-description" className={labelClasses}>
            Description
          </label>
          <textarea
            id="sf-description"
            maxLength={5000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-vermont-forest/30 bg-background px-3 py-2 text-sm focus:border-vermont-forest focus:outline-none focus:ring-1 focus:ring-vermont-forest"
          />
          {errors.description && <p className={errorClasses}>{errors.description}</p>}
        </div>

        {/* All Day checkbox */}
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            id="sf-allday"
            checked={allDay}
            onChange={(e) => {
              setAllDay(e.target.checked);
              if (e.target.checked) {
                setEndsAtLocal('');
              }
            }}
          />
          <label htmlFor="sf-allday" className="text-sm font-medium text-vermont-forest">
            All day event
          </label>
        </div>

        {/* Start date+time */}
        <div>
          <label htmlFor="sf-starts" className={labelClasses}>
            {allDay ? 'Start date' : 'Start date & time'} <span className="text-red-500">*</span>
          </label>
          <input
            id="sf-starts"
            type={allDay ? 'date' : 'datetime-local'}
            required
            value={startsAtLocal}
            onChange={(e) => setStartsAtLocal(e.target.value)}
            className={fieldClasses}
          />
          {errors.startsAtLocal && <p className={errorClasses}>{errors.startsAtLocal}</p>}
        </div>

        {/* End date+time */}
        {!allDay && (
          <div>
            <label htmlFor="sf-ends" className={labelClasses}>
              End date & time
            </label>
            <input
              id="sf-ends"
              type="datetime-local"
              value={endsAtLocal}
              onChange={(e) => setEndsAtLocal(e.target.value)}
              className={fieldClasses}
            />
            {errors.endsAtLocal && <p className={errorClasses}>{errors.endsAtLocal}</p>}
          </div>
        )}

        {/* Region */}
        <div>
          <label htmlFor="sf-region" className={labelClasses}>
            Region <span className="text-red-500">*</span>
          </label>
          <select
            id="sf-region"
            required
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={fieldClasses}
          >
            <option value="">Select a region</option>
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.region && <p className={errorClasses}>{errors.region}</p>}
        </div>

        {/* Category */}
        <div>
          <label htmlFor="sf-category" className={labelClasses}>
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="sf-category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={fieldClasses}
          >
            <option value="">Select a category</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.category && <p className={errorClasses}>{errors.category}</p>}
        </div>

        {/* Venue Name */}
        <div>
          <label htmlFor="sf-venue" className={labelClasses}>
            Venue name
          </label>
          <input
            id="sf-venue"
            type="text"
            maxLength={200}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className={fieldClasses}
          />
        </div>

        {/* Venue Address */}
        <div>
          <label htmlFor="sf-venueaddr" className={labelClasses}>
            Venue address
          </label>
          <input
            id="sf-venueaddr"
            type="text"
            maxLength={500}
            value={venueAddress}
            onChange={(e) => setVenueAddress(e.target.value)}
            className={fieldClasses}
          />
        </div>

        {/* Tags */}
        <div className="sm:col-span-2">
          <label htmlFor="sf-tags" className={labelClasses}>
            Tags (comma-separated, max 12)
          </label>
          <input
            id="sf-tags"
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="e.g. live-music, outdoor, family-friendly"
            className={fieldClasses}
          />
          {errors.tagsRaw && <p className={errorClasses}>{errors.tagsRaw}</p>}
        </div>

        {/* URL */}
        <div>
          <label htmlFor="sf-url" className={labelClasses}>
            Event URL
          </label>
          <input
            id="sf-url"
            type="url"
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={fieldClasses}
          />
          {errors.url && <p className={errorClasses}>{errors.url}</p>}
        </div>

        {/* Image URL */}
        <div>
          <label htmlFor="sf-imageurl" className={labelClasses}>
            Image URL
          </label>
          <input
            id="sf-imageurl"
            type="url"
            maxLength={2048}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={fieldClasses}
          />
          {errors.imageUrl && <p className={errorClasses}>{errors.imageUrl}</p>}
        </div>

        {/* Contact email */}
        <div className="sm:col-span-2">
          <label htmlFor="sf-email" className={labelClasses}>
            Contact email <span className="text-red-500">*</span>
          </label>
          <input
            id="sf-email"
            type="email"
            required
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            className={fieldClasses}
          />
          {errors.submitterEmail && <p className={errorClasses}>{errors.submitterEmail}</p>}
        </div>
      </div>

      {/* Honeypot + hidden clientStartedAt */}
      <Honeypot value={hpUrl} onChange={setHpUrl} />
      <input type="hidden" name="clientStartedAt" value={clientStartedAt} />

      {/* Submit */}
      <div className="pt-2">
        <Button type="submit" disabled={submitting} size="lg">
          {submitting ? 'Submitting...' : 'Submit Event'}
        </Button>
      </div>
    </form>
  );
}
