/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import RunStatusBadge from '@/components/admin/RunStatusBadge';

/* ------------------------------------------------------------------ */
/*  Cleanup                                                            */
/* ------------------------------------------------------------------ */

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('RunStatusBadge', () => {
  it('renders "OK" label for status "ok"', () => {
    render(<RunStatusBadge status="ok" />);
    expect(screen.getByText('OK')).toBeDefined();
  });

  it('renders "Partial" label for status "partial"', () => {
    render(<RunStatusBadge status="partial" />);
    expect(screen.getByText('Partial')).toBeDefined();
  });

  it('renders "Error" label for status "error"', () => {
    render(<RunStatusBadge status="error" />);
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('renders "Running" label for status "running"', () => {
    render(<RunStatusBadge status="running" />);
    expect(screen.getByText('Running')).toBeDefined();
  });

  it('renders "Unknown" label for an unrecognised status', () => {
    render(<RunStatusBadge status="something-else" />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('applies vermont-forest class for "ok" status', () => {
    render(<RunStatusBadge status="ok" />);
    const badge = screen.getByText('OK');
    expect(badge.className).toContain('vermont-forest');
  });

  it('applies amber class for "partial" status', () => {
    render(<RunStatusBadge status="partial" />);
    const badge = screen.getByText('Partial');
    expect(badge.className).toContain('amber');
  });

  it('applies red class for "error" status', () => {
    render(<RunStatusBadge status="error" />);
    const badge = screen.getByText('Error');
    expect(badge.className).toContain('red');
  });

  it('applies slate class for "running" status', () => {
    render(<RunStatusBadge status="running" />);
    const badge = screen.getByText('Running');
    expect(badge.className).toContain('slate');
  });

  it('applies gray class for unknown/fallback status', () => {
    render(<RunStatusBadge status="foo" />);
    const badge = screen.getByText('Unknown');
    expect(badge.className).toContain('gray');
  });

  it('renders as an inline span with rounded-full class', () => {
    render(<RunStatusBadge status="ok" />);
    const badge = screen.getByText('OK');
    expect(badge.tagName.toLowerCase()).toBe('span');
    expect(badge.className).toContain('rounded-full');
  });
});
