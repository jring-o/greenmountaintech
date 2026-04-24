import { describe, expect, it, vi } from 'vitest';

/**
 * Mock `@/lib/env` so the module-level `parseEnv()` call never fires.
 * We provide a fake ADMIN_EMAILS array matching what the zod transform
 * would produce from "admin@example.com".
 */
vi.mock('@/lib/env', () => ({
  env: {
    ADMIN_EMAILS: ['admin@example.com'],
  },
}));

/* Import *after* the mock is in place. */
import { isAdmin } from '@/lib/auth/admin';

describe('isAdmin', () => {
  it('returns false for undefined', () => {
    expect(isAdmin(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAdmin('')).toBe(false);
  });

  it('returns true for an allowlisted email', () => {
    expect(isAdmin('admin@example.com')).toBe(true);
  });

  it('returns true for the same email upper-cased', () => {
    expect(isAdmin('ADMIN@EXAMPLE.COM')).toBe(true);
  });

  it('returns false for a non-allowlisted email', () => {
    expect(isAdmin('stranger@example.com')).toBe(false);
  });
});
