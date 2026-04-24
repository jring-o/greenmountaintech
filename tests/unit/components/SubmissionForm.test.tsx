/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock next/navigation (unused by SubmissionForm but may be pulled   */
/*  transitively)                                                       */
/* ------------------------------------------------------------------ */

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

/* ------------------------------------------------------------------ */
/*  Import component + helper under test                                */
/* ------------------------------------------------------------------ */

import SubmissionForm, { parseTags } from '@/components/public/SubmissionForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Fill all required fields so client validation passes. */
function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { value: 'Summer Concert in the Park' },
  });
  fireEvent.change(screen.getByLabelText(/start date/i), {
    target: { value: '2026-07-04T10:00' },
  });
  fireEvent.change(screen.getByLabelText(/region/i), {
    target: { value: 'burlington_area' },
  });
  fireEvent.change(screen.getByLabelText(/category/i), {
    target: { value: 'music' },
  });
  fireEvent.change(screen.getByLabelText(/contact email/i), {
    target: { value: 'test@example.com' },
  });
}
/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('SubmissionForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /* -- Client validation: title ---------------------------------------- */

  it('rejects title shorter than 3 characters', async () => {
    render(<SubmissionForm />);

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'AB' } });

    const regionSelect = screen.getByLabelText(/region/i);
    fireEvent.change(regionSelect, { target: { value: 'statewide' } });

    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'other' } });

    const emailInput = screen.getByLabelText(/contact email/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const startsInput = screen.getByLabelText(/start date/i);
    fireEvent.change(startsInput, { target: { value: '2026-06-01T10:00' } });

    const submitBtn = screen.getByRole('button', { name: /submit event/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/title must be at least 3 characters/i)).toBeDefined();
  });

  /* -- Tag normalization ----------------------------------------------- */

  it('parseTags normalizes mixed case tags to lowercase array', () => {
    const result = parseTags('Folk, JAZZ');
    expect(result).toEqual(['folk', 'jazz']);
  });

  it('parseTags removes empty entries and duplicates', () => {
    const result = parseTags('Folk, , folk, JAZZ, jazz');
    expect(result).toEqual(['folk', 'jazz']);
  });

  /* -- All day checkbox hides time field -------------------------------- */

  it('"All day" checkbox hides the end time field', () => {
    render(<SubmissionForm />);
    expect(screen.getByLabelText(/end date & time/i)).toBeDefined();
    const allDayCheckbox = screen.getByLabelText(/all day event/i);
    fireEvent.click(allDayCheckbox);
    expect(screen.queryByLabelText(/end date & time/i)).toBeNull();
  });

  it('"All day" checkbox changes start field to date input', () => {
    render(<SubmissionForm />);
    const startsInput = screen.getByLabelText(/start date/i);
    expect(startsInput.getAttribute('type')).toBe('datetime-local');
    const allDayCheckbox = screen.getByLabelText(/all day event/i);
    fireEvent.click(allDayCheckbox);
    const startsInputAfter = screen.getByLabelText(/start date/i);
    expect(startsInputAfter.getAttribute('type')).toBe('date');
  });

  /* -- Honeypot a11y --------------------------------------------------- */

  it('honeypot has aria-hidden and tabindex=-1', () => {
    render(<SubmissionForm />);
    const honeypotInput = document.querySelector('input[name="hp_url"]');
    expect(honeypotInput).not.toBeNull();
    expect(honeypotInput!.getAttribute('tabindex')).toBe('-1');
    const honeypotWrapper = honeypotInput!.closest('[aria-hidden]');
    expect(honeypotWrapper).not.toBeNull();
    expect(honeypotWrapper!.getAttribute('aria-hidden')).toBe('true');
  });

  /* -- Required field validation --------------------------------------- */

  it('shows validation errors for missing required fields', () => {
    render(<SubmissionForm />);
    const submitBtn = screen.getByRole('button', { name: /submit event/i });
    fireEvent.click(submitBtn);
    expect(screen.getByText(/title must be at least 3 characters/i)).toBeDefined();
    expect(screen.getByText(/start date is required/i)).toBeDefined();
    expect(screen.getByText(/region is required/i)).toBeDefined();
    expect(screen.getByText(/category is required/i)).toBeDefined();
    expect(screen.getByText(/contact email is required/i)).toBeDefined();
  });
  /* -- Client validation: invalid email format ------------------------- */

  it('rejects invalid email format', () => {
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    expect(screen.getByText(/enter a valid email address/i)).toBeDefined();
  });

  /* -- Client validation: end before start ----------------------------- */

  it('rejects end date before start date', () => {
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: '2026-07-04T19:00' },
    });
    fireEvent.change(screen.getByLabelText(/end date & time/i), {
      target: { value: '2026-07-04T17:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    expect(screen.getByText(/end must be after start/i)).toBeDefined();
  });

  /* -- clientStartedAt set on mount ------------------------------------ */

  it('sets clientStartedAt hidden input on mount', async () => {
    render(<SubmissionForm />);
    await waitFor(() => {
      const hiddenInput = document.querySelector(
        'input[name="clientStartedAt"]',
      ) as HTMLInputElement;
      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput.value).toBeTruthy();
      expect(Number.isNaN(Date.parse(hiddenInput.value))).toBe(false);
    });
  });

  /* -- handleSubmit: happy path (201) shows thank-you ------------------ */

  it('shows thank-you screen after successful submission (201)', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { id: 'evt-1' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    await waitFor(() => {
      expect(screen.getByTestId('thank-you')).toBeDefined();
    });
    expect(screen.getByText('Thank you!')).toBeDefined();
    expect(screen.getByText(/back to calendar/i)).toBeDefined();
    expect(screen.getByText(/submit another/i)).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/submissions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  /* -- handleSubmit: 422 server error with field details ---------------- */

  it('displays server validation errors on 422 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [
              { path: 'title', message: 'Title already exists' },
              {
                path: 'submitterEmail',
                message: 'Disposable email not allowed',
              },
            ],
          },
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeDefined();
    });
    expect(screen.getByText('Title already exists')).toBeDefined();
    expect(screen.getByText('Disposable email not allowed')).toBeDefined();
  });

  /* -- handleSubmit: 429 rate limit error ------------------------------ */

  it('displays rate limit error on 429 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many submissions. Please try again later.',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    await waitFor(() => {
      expect(screen.getByText(/too many submissions/i)).toBeDefined();
    });
  });

  /* -- handleSubmit: unexpected status shows generic error -------------- */

  it('shows generic error for unexpected server status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    await waitFor(() => {
      expect(screen.getByText(/an unexpected error occurred/i)).toBeDefined();
    });
  });

  /* -- handleSubmit: network error ------------------------------------- */

  it('shows network error when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<SubmissionForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit event/i }));
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeDefined();
    });
  });
});
