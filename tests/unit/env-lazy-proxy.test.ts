import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests the lazy-proxy behavior introduced in S07.
 *
 * lib/env.ts now exports a Proxy that defers parseEnv() until the first
 * property access.  These tests verify:
 *   1. Importing the module does NOT throw even when env vars are missing.
 *   2. Accessing a property on `env` triggers validation and throws when
 *      required vars are absent.
 *   3. When all required vars are present, property access returns the
 *      parsed value.
 *   4. The parsed result is cached (parseEnv runs only once).
 */

/* ---------- Minimal valid env fixture ----------------------------------- */
function setValidEnv() {
  process.env.DATABASE_URL = 'https://db.example.com/test';
  process.env.DATABASE_URL_UNPOOLED = 'https://db.example.com/test';
  process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
  process.env.CLERK_SECRET_KEY = 'sk_test_abc';
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
  process.env.ADMIN_EMAILS = 'admin@example.com';
  process.env.CRON_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.USER_AGENT_CONTACT = 'scraper@example.com';
  process.env.SUBMISSION_IP_SALT = '0123456789abcdef0123456789abcdef';
}

/* Keys that setValidEnv writes */
const VALID_KEYS = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'ADMIN_EMAILS',
  'CRON_SECRET',
  'USER_AGENT_CONTACT',
  'SUBMISSION_IP_SALT',
] as const;

function clearEnvKeys() {
  for (const key of VALID_KEYS) {
    delete process.env[key];
  }
  // Also clear optional/default keys that might persist
  delete process.env.INGEST_CONCURRENCY;
  delete process.env.DEDUPE_AUTO_THRESHOLD;
  delete process.env.DEDUPE_REVIEW_THRESHOLD;
  delete process.env.DEBUG;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.NEON_API_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
}

describe('lib/env lazy proxy', () => {
  beforeEach(() => {
    // Reset the module registry so the cached _cached value is cleared
    vi.resetModules();
    clearEnvKeys();
  });

  afterEach(() => {
    vi.resetModules();
    clearEnvKeys();
  });

  it('importing the module does NOT throw when env vars are missing', async () => {
    // This is the key behavioral change in S07: import should succeed
    // even without env vars set, because validation is deferred.
    const mod = await import('@/lib/env');
    expect(mod.env).toBeDefined();
  });

  it('accessing a property on env throws when required vars are missing', async () => {
    const { env } = await import('@/lib/env');
    expect(() => env.DATABASE_URL).toThrow('Environment validation failed');
  });

  it('accessing a property returns the parsed value when env is valid', async () => {
    setValidEnv();
    const { env } = await import('@/lib/env');
    expect(env.DATABASE_URL).toBe('https://db.example.com/test');
    expect(env.USER_AGENT_CONTACT).toBe('scraper@example.com');
  });

  it('ADMIN_EMAILS is transformed into a lowercase trimmed array', async () => {
    setValidEnv();
    process.env.ADMIN_EMAILS = '  Alice@Example.COM , bob@test.org  ';
    const { env } = await import('@/lib/env');
    expect(env.ADMIN_EMAILS).toEqual(['alice@example.com', 'bob@test.org']);
  });

  it('default values are applied for optional numeric fields', async () => {
    setValidEnv();
    const { env } = await import('@/lib/env');
    expect(env.INGEST_CONCURRENCY).toBe(4);
    expect(env.DEDUPE_AUTO_THRESHOLD).toBe(0.92);
    expect(env.DEDUPE_REVIEW_THRESHOLD).toBe(0.75);
    expect(env.DEBUG).toBe(false);
  });

  it('parsed result is cached across multiple property accesses', async () => {
    setValidEnv();
    const { env } = await import('@/lib/env');
    // First access triggers parseEnv
    const url1 = env.DATABASE_URL;
    // Mutate process.env AFTER first access -- should NOT change cached value
    process.env.DATABASE_URL = 'https://changed.example.com/other';
    const url2 = env.DATABASE_URL;
    expect(url1).toBe(url2);
    expect(url2).toBe('https://db.example.com/test');
  });

  it('error message lists the specific missing variables', async () => {
    // Set only some vars, leave DATABASE_URL missing
    setValidEnv();
    delete process.env.DATABASE_URL;
    const { env } = await import('@/lib/env');
    try {
      // access a property to trigger validation
      void env.ADMIN_EMAILS;
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain('DATABASE_URL');
    }
  });
});
