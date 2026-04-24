/**
 * lib/auth/ip.ts -- Client IP extraction and hashing for rate-limit keying.
 *
 * getClientIp reads `x-forwarded-for` (first comma-separated value on Vercel).
 * hashIp produces a SHA-256 hex digest of `${ip}|${SUBMISSION_IP_SALT}`.
 */

import { createHash } from 'node:crypto';

import { env } from '@/lib/env';

/**
 * Extract the client IP address from the incoming request.
 * On Vercel, `x-forwarded-for` contains the real client IP as the first
 * comma-separated value. Returns `null` when the header is absent.
 */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  const first = xff.split(',')[0]?.trim();
  return first || null;
}

/**
 * Hash an IP address with the server-side salt for privacy-safe storage.
 * Deterministic: same ip always produces the same hash.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}|${env.SUBMISSION_IP_SALT}`).digest('hex');
}
