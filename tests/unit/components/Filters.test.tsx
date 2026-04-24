/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock next/navigation                                                */
/* ------------------------------------------------------------------ */

const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
}));

/* ------------------------------------------------------------------ */
/*  Import component after mocks are set up                             */
/* ------------------------------------------------------------------ */

import Filters from '@/components/public/Filters';

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('Filters', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    currentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders region, category, and search inputs', () => {
    render(<Filters />);

    expect(screen.getByText('Region')).toBeDefined();
    expect(screen.getByText('Category')).toBeDefined();
    expect(screen.getByText('Search')).toBeDefined();
  });

  it('selecting a region updates URL with ?region=...', () => {
    render(<Filters />);

    const regionSelect = screen.getByDisplayValue('All regions');
    fireEvent.change(regionSelect, {
      target: { value: 'burlington_area' },
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('region=burlington_area');
  });

  it('selecting a category updates URL with ?category=...', () => {
    render(<Filters />);

    const categorySelect = screen.getByDisplayValue('All categories');
    fireEvent.change(categorySelect, {
      target: { value: 'music' },
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('category=music');
  });

  it('typing in search updates URL with ?q=...', () => {
    render(<Filters />);

    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, {
      target: { value: 'open mic' },
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('q=open+mic');
  });

  it('clearing search removes q from URL', () => {
    currentSearchParams = new URLSearchParams('q=test');
    render(<Filters />);

    const searchInput = screen.getByPlaceholderText('Search events...');
    fireEvent.change(searchInput, {
      target: { value: '' },
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain('q=');
  });

  it('reset button clears all filter params', () => {
    currentSearchParams = new URLSearchParams('region=central_vt&category=music&q=test');
    render(<Filters />);

    const resetButton = screen.getByText('Reset');
    fireEvent.click(resetButton);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain('region=');
    expect(calledUrl).not.toContain('category=');
    expect(calledUrl).not.toContain('q=');
  });

  it('reset button is not shown when no filters are active', () => {
    render(<Filters />);

    expect(screen.queryByText('Reset')).toBeNull();
  });

  it('preserves existing non-filter params (view, date) when changing filters', () => {
    currentSearchParams = new URLSearchParams('view=week&date=2026-05-01');
    render(<Filters />);

    const regionSelect = screen.getByDisplayValue('All regions');
    fireEvent.change(regionSelect, {
      target: { value: 'southern_vt' },
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const calledUrl = mockReplace.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('view=week');
    expect(calledUrl).toContain('date=2026-05-01');
    expect(calledUrl).toContain('region=southern_vt');
  });

  it('replace is called with scroll: false option', () => {
    render(<Filters />);

    const regionSelect = screen.getByDisplayValue('All regions');
    fireEvent.change(regionSelect, {
      target: { value: 'burlington_area' },
    });

    expect(mockReplace).toHaveBeenCalledWith(expect.any(String), { scroll: false });
  });
});
