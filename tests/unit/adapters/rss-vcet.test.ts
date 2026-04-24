import { describe, expect, it } from 'vitest';

import { dateFromContent, dateFromSlug } from '@/lib/adapters/rss-vcet';

describe('rss-vcet: dateFromSlug', () => {
  it('extracts the trailing YYYY-MM-DD from a typical VCET slug', () => {
    const url =
      'https://vcet.co/vcet-launches-ai-after-hours-meetup-series-for-builders-and-innovators-2026-04-08/';
    expect(dateFromSlug(url)).toBe('2026-04-08T00:00:00');
  });

  it('handles slug without trailing slash', () => {
    expect(dateFromSlug('https://vcet.co/some-event-2026-12-31')).toBe('2026-12-31T00:00:00');
  });

  it('returns null when no date suffix is present', () => {
    expect(dateFromSlug('https://vcet.co/some-event-without-date/')).toBeNull();
  });

  it('returns null when date is implausible (year out of range)', () => {
    expect(dateFromSlug('https://vcet.co/foo-1999-01-01/')).toBeNull();
  });

  it('returns null when month or day is out of range', () => {
    expect(dateFromSlug('https://vcet.co/foo-2026-13-01/')).toBeNull();
    expect(dateFromSlug('https://vcet.co/foo-2026-01-32/')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(dateFromSlug(undefined)).toBeNull();
  });
});

describe('rss-vcet: dateFromContent', () => {
  it('extracts a date from HTML content via chrono', () => {
    const html = '<p>Save the date! Our event is on April 8, 2026 at 5:30 PM at VCET.</p>';
    const result = dateFromContent(html);
    expect(result).toMatch(/^2026-04-08T(05|17):30:00$/);
  });

  it('returns null when no date is found in the content', () => {
    expect(
      dateFromContent('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>'),
    ).toBeNull();
  });

  it('returns null for undefined or empty content', () => {
    expect(dateFromContent(undefined)).toBeNull();
    expect(dateFromContent('')).toBeNull();
  });
});
