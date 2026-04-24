import { describe, expect, it } from 'vitest';

/**
 * Tests for the pure helper functions defined in
 * app/(admin)/admin/page.tsx.
 *
 * These functions are not exported from the page module, so we replicate
 * them here exactly as they appear in source and test the specification:
 *   - cronStatusLabel: maps cron status strings to display labels
 *   - cronStatusColor: maps cron status strings to Tailwind text color classes
 *
 * If the source functions ever change, these tests must be updated to match.
 */

/* ------------------------------------------------------------------ */
/*  Replicated helpers (must match source exactly)                     */
/* ------------------------------------------------------------------ */

function cronStatusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'partial') return 'Partial';
  if (status === 'error') return 'Error';
  if (status === 'running') return 'Running';
  return status;
}

function cronStatusColor(status: string): string {
  if (status === 'ok') return 'text-green-700';
  if (status === 'partial') return 'text-amber-700';
  if (status === 'running') return 'text-blue-700';
  return 'text-red-700';
}

/* ------------------------------------------------------------------ */
/*  cronStatusLabel tests                                              */
/* ------------------------------------------------------------------ */

describe('cronStatusLabel', () => {
  it('returns "OK" for status "ok"', () => {
    expect(cronStatusLabel('ok')).toBe('OK');
  });

  it('returns "Partial" for status "partial"', () => {
    expect(cronStatusLabel('partial')).toBe('Partial');
  });

  it('returns "Error" for status "error"', () => {
    expect(cronStatusLabel('error')).toBe('Error');
  });

  it('returns "Running" for status "running"', () => {
    expect(cronStatusLabel('running')).toBe('Running');
  });

  it('returns the raw status string for unknown statuses', () => {
    expect(cronStatusLabel('unknown-status')).toBe('unknown-status');
  });

  it('returns the raw status string for empty string', () => {
    expect(cronStatusLabel('')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  cronStatusColor tests                                              */
/* ------------------------------------------------------------------ */

describe('cronStatusColor', () => {
  it('returns green for "ok" status', () => {
    expect(cronStatusColor('ok')).toBe('text-green-700');
  });

  it('returns amber for "partial" status', () => {
    expect(cronStatusColor('partial')).toBe('text-amber-700');
  });

  it('returns blue for "running" status', () => {
    expect(cronStatusColor('running')).toBe('text-blue-700');
  });

  it('returns red for "error" status (fallback)', () => {
    expect(cronStatusColor('error')).toBe('text-red-700');
  });

  it('returns red for unknown status (fallback)', () => {
    expect(cronStatusColor('something-else')).toBe('text-red-700');
  });

  it('returns red for empty string (fallback)', () => {
    expect(cronStatusColor('')).toBe('text-red-700');
  });
});
