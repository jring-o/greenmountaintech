import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Re-create the env schema here to test the zod schema directly without
 * importing lib/env.ts (which triggers module-level validation and throws
 * when env vars are missing). This mirrors the schema in lib/env.ts exactly.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  ADMIN_EMAILS: z.string().transform((s) =>
    s
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
  CRON_SECRET: z.string().min(32),
  USER_AGENT_CONTACT: z.string().email(),
  SUBMISSION_IP_SALT: z.string().min(32),
  INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
  DEDUPE_AUTO_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  DEDUPE_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  NEON_API_KEY: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  DEBUG: z.coerce.boolean().default(false),
});

/** Minimal valid env object for testing -- satisfies all required fields. */
function validEnv(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_URL: 'https://db.example.com/test',
    DATABASE_URL_UNPOOLED: 'https://db.example.com/test',
    CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
    CLERK_SECRET_KEY: 'sk_test_abc',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
    ADMIN_EMAILS: 'admin@example.com',
    CRON_SECRET: '0123456789abcdef0123456789abcdef',
    USER_AGENT_CONTACT: 'scraper@example.com',
    SUBMISSION_IP_SALT: '0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

describe('envSchema', () => {
  it('accepts a fully valid env object', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
  });

  it('rejects CRON_SECRET shorter than 32 characters', () => {
    const result = envSchema.safeParse(validEnv({ CRON_SECRET: 'tooshort' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('CRON_SECRET');
    }
  });

  it('rejects USER_AGENT_CONTACT that is not an email', () => {
    const result = envSchema.safeParse(validEnv({ USER_AGENT_CONTACT: 'not-an-email' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('USER_AGENT_CONTACT');
    }
  });

  it('applies defaults for optional numeric fields', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.INGEST_CONCURRENCY).toBe(4);
      expect(result.data.DEDUPE_AUTO_THRESHOLD).toBe(0.92);
      expect(result.data.DEDUPE_REVIEW_THRESHOLD).toBe(0.75);
      expect(result.data.DEBUG).toBe(false);
    }
  });
});
