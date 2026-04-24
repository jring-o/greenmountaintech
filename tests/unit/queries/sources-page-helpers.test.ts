import { describe, expect, it } from 'vitest';

/**
 * Tests for the pure helper functions defined in
 * app/(admin)/admin/sources/page.tsx.
 *
 * These functions are not exported from the page module, so we replicate
 * them here exactly as they appear in source and test the specification:
 *   - successRate: computes "ok_30d / runs_30d" as a percentage string
 *   - rowHealthClasses: returns CSS classes based on source health state
 *
 * If the source functions ever change, these tests must be updated to match.
 */

/* ------------------------------------------------------------------ */
/*  Replicated helpers (must match source exactly)                     */
/* ------------------------------------------------------------------ */

interface SourceHealthInput {
  runs_30d: number;
  ok_30d: number;
  is_active: boolean;
  consecutive_failures: number;
}

function successRate(source: { runs_30d: number; ok_30d: number }): string {
  if (source.runs_30d === 0) return '--';
  const rate = (source.ok_30d / source.runs_30d) * 100;
  return rate.toFixed(0) + '%';
}

function rowHealthClasses(source: SourceHealthInput): string {
  if (!source.is_active) return 'opacity-50 bg-gray-50';
  if (source.consecutive_failures >= 5) return 'bg-red-100';
  if (source.consecutive_failures >= 3) return 'bg-vermont-cream';
  return '';
}

/* ------------------------------------------------------------------ */
/*  successRate tests                                                   */
/* ------------------------------------------------------------------ */

describe('successRate', () => {
  it('returns "--" when runs_30d is 0', () => {
    expect(successRate({ runs_30d: 0, ok_30d: 0 })).toBe('--');
  });

  it('returns "100%" when all runs are ok', () => {
    expect(successRate({ runs_30d: 10, ok_30d: 10 })).toBe('100%');
  });

  it('returns "0%" when no runs are ok', () => {
    expect(successRate({ runs_30d: 10, ok_30d: 0 })).toBe('0%');
  });

  it('returns "50%" when half the runs are ok', () => {
    expect(successRate({ runs_30d: 20, ok_30d: 10 })).toBe('50%');
  });

  it('rounds to nearest integer percentage', () => {
    // 7/10 = 70%
    expect(successRate({ runs_30d: 10, ok_30d: 7 })).toBe('70%');
    // 1/3 = 33.33...%
    expect(successRate({ runs_30d: 3, ok_30d: 1 })).toBe('33%');
    // 2/3 = 66.66...%
    expect(successRate({ runs_30d: 3, ok_30d: 2 })).toBe('67%');
  });

  it('handles single run ok', () => {
    expect(successRate({ runs_30d: 1, ok_30d: 1 })).toBe('100%');
  });

  it('handles single run failure', () => {
    expect(successRate({ runs_30d: 1, ok_30d: 0 })).toBe('0%');
  });
});

/* ------------------------------------------------------------------ */
/*  rowHealthClasses tests                                             */
/* ------------------------------------------------------------------ */

describe('rowHealthClasses', () => {
  it('returns grey classes when source is inactive', () => {
    const result = rowHealthClasses({
      is_active: false,
      consecutive_failures: 0,
      runs_30d: 10,
      ok_30d: 10,
    });
    expect(result).toBe('opacity-50 bg-gray-50');
  });

  it('returns grey classes when inactive even with high failures', () => {
    // is_active = false takes precedence over failure count
    const result = rowHealthClasses({
      is_active: false,
      consecutive_failures: 10,
      runs_30d: 10,
      ok_30d: 0,
    });
    expect(result).toBe('opacity-50 bg-gray-50');
  });

  it('returns red when consecutive_failures >= 5', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 5,
      runs_30d: 10,
      ok_30d: 5,
    });
    expect(result).toBe('bg-red-100');
  });

  it('returns red when consecutive_failures is high (e.g. 10)', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 10,
      runs_30d: 20,
      ok_30d: 10,
    });
    expect(result).toBe('bg-red-100');
  });

  it('returns yellow (bg-vermont-cream) when consecutive_failures >= 3 and < 5', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 3,
      runs_30d: 10,
      ok_30d: 7,
    });
    expect(result).toBe('bg-vermont-cream');
  });

  it('returns yellow when consecutive_failures is 4', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 4,
      runs_30d: 10,
      ok_30d: 6,
    });
    expect(result).toBe('bg-vermont-cream');
  });

  it('returns empty string when active with low failures (< 3)', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 0,
      runs_30d: 10,
      ok_30d: 10,
    });
    expect(result).toBe('');
  });

  it('returns empty string when active with 2 consecutive failures', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 2,
      runs_30d: 10,
      ok_30d: 8,
    });
    expect(result).toBe('');
  });

  it('returns empty string when active with 1 consecutive failure', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 1,
      runs_30d: 10,
      ok_30d: 9,
    });
    expect(result).toBe('');
  });

  // Boundary tests
  it('boundary: consecutive_failures = 3 is yellow, not red', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 3,
      runs_30d: 5,
      ok_30d: 2,
    });
    expect(result).toBe('bg-vermont-cream');
    expect(result).not.toBe('bg-red-100');
  });

  it('boundary: consecutive_failures = 5 is red, not yellow', () => {
    const result = rowHealthClasses({
      is_active: true,
      consecutive_failures: 5,
      runs_30d: 5,
      ok_30d: 0,
    });
    expect(result).toBe('bg-red-100');
    expect(result).not.toBe('bg-vermont-cream');
  });
});
