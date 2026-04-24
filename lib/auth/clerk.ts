import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { isAdmin } from '@/lib/auth/admin';

/**
 * Server-side guard: resolves silently when the current user is an admin,
 * calls notFound() (404) otherwise. Usable from server components and
 * route handlers.
 */
export async function requireAdmin(): Promise<void> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return notFound();
    const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : undefined;
    if (!isAdmin(email)) return notFound();
  } catch {
    // auth() or env validation (e.g. missing ADMIN_EMAILS) can throw;
    // surface as 404 to avoid leaking internal error details
    return notFound();
  }
}
