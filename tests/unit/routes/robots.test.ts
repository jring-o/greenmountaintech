import { describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SITE_DOMAIN: 'https://example.com' },
}));

/* ------------------------------------------------------------------ */
/*  Import the function under test                                     */
/* ------------------------------------------------------------------ */

import robots from '@/app/robots';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('robots()', () => {
  it('allows / path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/');
  });

  it('allows /events/ path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/events/');
  });

  it('allows /about path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/about');
  });

  it('allows /submit path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/submit');
  });

  it('allows /feed.ics path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/feed.ics');
  });

  it('allows /feed.rss path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.allow).toContain('/feed.rss');
  });

  it('disallows /admin path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.disallow).toContain('/admin');
  });

  it('disallows /api/ path', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.disallow).toContain('/api/');
  });

  it('applies rules to all user agents (*)', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rules.userAgent).toBe('*');
  });

  it('includes sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://example.com/sitemap.xml');
  });
});
