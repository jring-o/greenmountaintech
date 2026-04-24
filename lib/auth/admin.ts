import { env } from '@/lib/env';

/**
 * Returns true iff the given email is in the ADMIN_EMAILS allowlist.
 * Handles null, undefined, and empty-string inputs gracefully.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.ADMIN_EMAILS.includes(email.toLowerCase());
}
