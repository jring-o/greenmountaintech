import { z } from 'zod';

export const envSchema = z.object({
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
  NEXT_PUBLIC_SITE_DOMAIN: z.string().default('http://localhost:3000'),
  DEBUG: z.coerce.boolean().default(false),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    const parts = [
      'Environment validation failed:',
      ...missing,
      '',
      'Check .env.example for required variables.',
    ];
    throw new Error(parts.join('\n'));
  }
  return result.data;
}

type Env = z.infer<typeof envSchema>;

let _cached: Env | undefined;

/** Lazily validated environment -- parsed on first property access, not at import time. */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') return undefined;
    if (!_cached) {
      _cached = parseEnv();
    }
    return _cached[prop as keyof Env];
  },
});
