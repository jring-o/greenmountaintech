import { describe, expect, it } from 'vitest';

import { sourceCreateSchema, sourcePatchSchema } from '@/lib/validation/schemas';

function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [key]: _, ...rest } = obj;
  return rest;
}

/* ------------------------------------------------------------------ */
/*  sourceCreateSchema                                                 */
/* ------------------------------------------------------------------ */

describe('sourceCreateSchema', () => {
  const validSource = {
    name: 'Burlington Free Press Events',
    slug: 'burlington-free-press',
    kind: 'whitelist' as const,
    adapter_type: 'ical' as const,
    adapter_key: 'generic',
    url: 'https://example.com/events.ics',
  };

  it('accepts a minimal valid source (required fields only)', () => {
    const result = sourceCreateSchema.safeParse(validSource);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Burlington Free Press Events');
      expect(result.data.slug).toBe('burlington-free-press');
      // Check defaults
      expect(result.data.trust_level).toBe('review');
      expect(result.data.is_active).toBe(true);
      expect(result.data.adapter_config).toEqual({});
      expect(result.data.rate_limit_per_min).toBe(30);
      expect(result.data.robots_respect).toBe(true);
    }
  });

  it('accepts a fully populated source', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      adapter_config: { timeout: 5000 },
      trust_level: 'auto_publish',
      is_active: false,
      contact_url: 'https://example.com/contact',
      rate_limit_per_min: 60,
      robots_respect: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trust_level).toBe('auto_publish');
      expect(result.data.is_active).toBe(false);
      expect(result.data.rate_limit_per_min).toBe(60);
      expect(result.data.robots_respect).toBe(false);
    }
  });

  it('rejects a missing name', () => {
    const rest = omit(validSource, 'name');
    const result = sourceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = sourceCreateSchema.safeParse({ ...validSource, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name exceeding 200 chars', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      name: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing slug', () => {
    const rest = omit(validSource, 'slug');
    const result = sourceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an empty slug', () => {
    const result = sourceCreateSchema.safeParse({ ...validSource, slug: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a slug with uppercase characters', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      slug: 'Invalid-Slug',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a slug with special characters', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      slug: 'invalid_slug!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid kind enum value', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      kind: 'invalid_kind',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid adapter_type enum value', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      adapter_type: 'xml',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing adapter_key', () => {
    const rest = omit(validSource, 'adapter_key');
    const result = sourceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an empty adapter_key', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      adapter_key: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing url', () => {
    const rest = omit(validSource, 'url');
    const result = sourceCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid url format', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid trust_level enum value', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      trust_level: 'invalid_trust',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid contact_url format', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      contact_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts null for contact_url', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      contact_url: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects rate_limit_per_min below 1', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      rate_limit_per_min: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects rate_limit_per_min above 600', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      rate_limit_per_min: 601,
    });
    expect(result.success).toBe(false);
  });

  it('accepts admin_added as a valid kind', () => {
    const result = sourceCreateSchema.safeParse({
      ...validSource,
      kind: 'admin_added',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid adapter_type values', () => {
    for (const t of ['ical', 'rss', 'html', 'json'] as const) {
      const result = sourceCreateSchema.safeParse({
        ...validSource,
        adapter_type: t,
      });
      expect(result.success).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  sourcePatchSchema                                                  */
/* ------------------------------------------------------------------ */

describe('sourcePatchSchema', () => {
  it('accepts an empty object (no fields to update)', () => {
    const result = sourcePatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a single field update (name)', () => {
    const result = sourcePatchSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts updating is_active only', () => {
    const result = sourcePatchSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it('accepts updating multiple fields', () => {
    const result = sourcePatchSchema.safeParse({
      name: 'Updated',
      slug: 'updated',
      trust_level: 'auto_publish',
      rate_limit_per_min: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = sourcePatchSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name exceeding 200 chars', () => {
    const result = sourcePatchSchema.safeParse({
      name: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid slug format', () => {
    const result = sourcePatchSchema.safeParse({ slug: 'BAD SLUG!' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid kind enum value', () => {
    const result = sourcePatchSchema.safeParse({ kind: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid adapter_type enum value', () => {
    const result = sourcePatchSchema.safeParse({ adapter_type: 'xml' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty adapter_key', () => {
    const result = sourcePatchSchema.safeParse({ adapter_key: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid url format', () => {
    const result = sourcePatchSchema.safeParse({ url: 'bad-url' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid trust_level value', () => {
    const result = sourcePatchSchema.safeParse({ trust_level: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects rate_limit_per_min below 1', () => {
    const result = sourcePatchSchema.safeParse({ rate_limit_per_min: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects rate_limit_per_min above 600', () => {
    const result = sourcePatchSchema.safeParse({ rate_limit_per_min: 601 });
    expect(result.success).toBe(false);
  });

  it('accepts null for contact_url', () => {
    const result = sourcePatchSchema.safeParse({ contact_url: null });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid contact_url format', () => {
    const result = sourcePatchSchema.safeParse({
      contact_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});
