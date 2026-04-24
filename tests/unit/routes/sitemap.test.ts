import { afterEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock drizzle query builder chain
const mockRows = [
  { id: '11111111-1111-1111-1111-111111111111' },
  { id: '22222222-2222-2222-2222-222222222222' },
];

const mockWhere = vi.fn().mockResolvedValue(mockRows);
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock('@/lib/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SITE_DOMAIN: 'https://example.com' },
}));

// Mock drizzle operators -- spread real module so `sql` tag and pgTable etc. work
vi.mock('drizzle-orm', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    eq: vi.fn((...args: unknown[]) => ['eq', ...args]),
    isNull: vi.fn((...args: unknown[]) => ['isNull', ...args]),
    and: vi.fn((...args: unknown[]) => ['and', ...args]),
  };
});

/* ------------------------------------------------------------------ */
/*  Import the function under test                                     */
/* ------------------------------------------------------------------ */

import sitemap from '@/app/sitemap';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('sitemap()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes static pages /, /about, /submit', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://example.com/');
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/submit');
  });

  it('includes event detail pages for each published event', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain('https://example.com/events/11111111-1111-1111-1111-111111111111');
    expect(urls).toContain('https://example.com/events/22222222-2222-2222-2222-222222222222');
  });

  it('total entry count = 3 static + N events', async () => {
    const entries = await sitemap();
    // 3 static + 2 event pages from mockRows
    expect(entries).toHaveLength(5);
  });

  it('uses siteUrl as prefix for all URLs', async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/example\.com/);
    }
  });

  it('returns only static pages when no events exist', async () => {
    mockWhere.mockResolvedValueOnce([]);

    const entries = await sitemap();
    expect(entries).toHaveLength(3);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://example.com/');
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/submit');
  });
});
