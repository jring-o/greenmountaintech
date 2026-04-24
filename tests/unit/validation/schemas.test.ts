import { describe, expect, it } from 'vitest';

import {
  adminEventPatchSchema,
  adminSubmissionSchema,
  uuidParamSchema,
} from '@/lib/validation/schemas';

/* ------------------------------------------------------------------ */
/*  uuidParamSchema                                                    */
/* ------------------------------------------------------------------ */

describe('uuidParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = uuidParamSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = uuidParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = uuidParamSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing id field', () => {
    const result = uuidParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a numeric id', () => {
    const result = uuidParamSchema.safeParse({ id: 12345 });
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  adminSubmissionSchema                                                   */
/* ------------------------------------------------------------------ */

describe('adminSubmissionSchema', () => {
  const validSubmission = {
    title: 'Open Mic Night',
    starts_at_utc: '2026-05-01T19:00:00Z',
  };

  it('accepts a minimal valid submission', () => {
    const result = adminSubmissionSchema.safeParse(validSubmission);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Open Mic Night');
      expect(result.data.tzid).toBe('America/New_York');
      expect(result.data.all_day).toBe(false);
      expect(result.data.region).toBe('statewide');
      expect(result.data.category).toBe('other');
      expect(result.data.tags).toEqual([]);
    }
  });

  it('accepts a fully populated submission', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      description: 'A fun event',
      description_html: '<p>A fun event</p>',
      ends_at_utc: '2026-05-01T22:00:00Z',
      tzid: 'America/Chicago',
      all_day: true,
      venue_name: 'The Club',
      venue_address: '123 Main St',
      region: 'burlington_area',
      lat: '44.475',
      lng: '-73.212',
      url: 'https://example.com/event',
      image_url: 'https://example.com/image.jpg',
      category: 'music',
      tags: ['live', 'jazz'],
      submitter_email: 'user@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const result = adminSubmissionSchema.safeParse({
      starts_at_utc: '2026-05-01T19:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = adminSubmissionSchema.safeParse({
      title: '',
      starts_at_utc: '2026-05-01T19:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a title exceeding 300 chars', () => {
    const result = adminSubmissionSchema.safeParse({
      title: 'x'.repeat(301),
      starts_at_utc: '2026-05-01T19:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing starts_at_utc', () => {
    const result = adminSubmissionSchema.safeParse({ title: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid ISO datetime for starts_at_utc', () => {
    const result = adminSubmissionSchema.safeParse({
      title: 'Test',
      starts_at_utc: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ends_at_utc before starts_at_utc', () => {
    const result = adminSubmissionSchema.safeParse({
      title: 'Test',
      starts_at_utc: '2026-05-01T19:00:00Z',
      ends_at_utc: '2026-05-01T18:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      expect(msg).toContain('End date must be after start date');
    }
  });

  it('accepts ends_at_utc equal to starts_at_utc', () => {
    const result = adminSubmissionSchema.safeParse({
      title: 'Test',
      starts_at_utc: '2026-05-01T19:00:00Z',
      ends_at_utc: '2026-05-01T19:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid URL', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid image_url', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      image_url: 'bad-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid submitter_email', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      submitter_email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 5000 chars', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      description: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 tags', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tag exceeding 50 chars', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      tags: ['x'.repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid region enum value', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      region: 'invalid_region',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category enum value', () => {
    const result = adminSubmissionSchema.safeParse({
      ...validSubmission,
      category: 'invalid_category',
    });
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  adminEventPatchSchema                                              */
/* ------------------------------------------------------------------ */

describe('adminEventPatchSchema', () => {
  it('accepts an empty object (no fields to update)', () => {
    const result = adminEventPatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a single field update', () => {
    const result = adminEventPatchSchema.safeParse({ title: 'New Title' });
    expect(result.success).toBe(true);
  });

  it('accepts all admin-only fields together', () => {
    const result = adminEventPatchSchema.safeParse({
      status: 'published',
      category: 'music',
      region: 'burlington_area',
      tags: ['live'],
      merged_into: '550e8400-e29b-41d4-a716-446655440001',
      published_at: '2026-05-01T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status enum value', () => {
    const result = adminEventPatchSchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category enum value', () => {
    const result = adminEventPatchSchema.safeParse({
      category: 'invalid_cat',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid region enum value', () => {
    const result = adminEventPatchSchema.safeParse({
      region: 'invalid_region',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = adminEventPatchSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a title exceeding 300 chars', () => {
    const result = adminEventPatchSchema.safeParse({
      title: 'x'.repeat(301),
    });
    expect(result.success).toBe(false);
  });

  it('accepts nullable fields with null', () => {
    const result = adminEventPatchSchema.safeParse({
      ends_at_utc: null,
      venue_name: null,
      venue_address: null,
      url: null,
      image_url: null,
      lat: null,
      lng: null,
      merged_into: null,
      published_at: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid merged_into (non-UUID)', () => {
    const result = adminEventPatchSchema.safeParse({
      merged_into: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid url format', () => {
    const result = adminEventPatchSchema.safeParse({
      url: 'not-a-valid-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid image_url format', () => {
    const result = adminEventPatchSchema.safeParse({
      image_url: 'bad-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid ISO datetime for starts_at_utc', () => {
    const result = adminEventPatchSchema.safeParse({
      starts_at_utc: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid ISO datetime for published_at', () => {
    const result = adminEventPatchSchema.safeParse({
      published_at: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid ISO datetime for starts_at_utc', () => {
    const result = adminEventPatchSchema.safeParse({
      starts_at_utc: '2026-06-01T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 20 tags', () => {
    const result = adminEventPatchSchema.safeParse({
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a description exceeding 5000 chars', () => {
    const result = adminEventPatchSchema.safeParse({
      description: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});
