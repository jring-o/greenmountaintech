/**
 * app/api/submissions/route.ts -- Public event submission endpoint.
 *
 * POST /api/submissions
 *
 * Validation order:
 * 1. Optional Turnstile verification (if TURNSTILE_* env vars present)
 * 2. Parse body via submissionSchema
 * 3. Honeypot: non-empty hp_url -> 204
 * 4. Dwell: clientStartedAt must be 4s–60min before now
 * 5. Global rate limit (100/hr)
 * 6. Per-IP rate limit (3/hr)
 * 7. Convert local times to UTC
 * 8. Insert event with status='pending_review', source_id=NULL
 * 9. Run dedupe stub (populate dedup_candidates)
 * 10. Return 201 { ok: true, data: { id } }
 */

import { z } from 'zod';

import { getClientIp, hashIp } from '@/lib/auth/ip';
import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';
import { computeDedupeKey, findFuzzyCandidates } from '@/lib/ingest/dedupe';
import type { FuzzyDedupeContext } from '@/lib/ingest/dedupe';
import type { EventRowCandidate } from '@/lib/ingest/normalize';
import { log } from '@/lib/log';
import { checkAndIncrement, checkAndIncrementGlobal } from '@/lib/rate-limit';
import { toUtc } from '@/lib/tz';

export const runtime = 'nodejs';

/* ------------------------------------------------------------------ */
/*  Enum values (from schema pgEnums)                                  */
/* ------------------------------------------------------------------ */

const REGIONS = [
  'burlington_area',
  'champlain_valley',
  'central_vt',
  'northeast_kingdom',
  'southern_vt',
  'statewide',
] as const;

const CATEGORIES = [
  'music',
  'arts_theater',
  'food_drink',
  'community_civic',
  'outdoors_recreation',
  'family_kids',
  'education_lecture',
  'film',
  'sports',
  'farmers_market',
  'fundraiser',
  'other',
] as const;

/* ------------------------------------------------------------------ */
/*  Submission schema (§11.4)                                          */
/* ------------------------------------------------------------------ */

export const submissionSchema = z
  .object({
    title: z.string().trim().min(3).max(300),
    description: z.string().max(5000).optional(),
    startsAtLocal: z.string().datetime({ local: true }),
    endsAtLocal: z.string().datetime({ local: true }).optional(),
    tzid: z.string().default('America/New_York'),
    allDay: z.boolean().default(false),
    venueName: z.string().max(200).optional(),
    venueAddress: z.string().max(500).optional(),
    region: z.enum(REGIONS),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(32)).max(12).default([]),
    url: z.string().url().max(2048).optional(),
    imageUrl: z.string().url().max(2048).optional(),
    submitterEmail: z.string().email(),
    clientStartedAt: z.string().datetime(),
    hp_url: z.string().default(''),
  })
  .refine((d) => !d.endsAtLocal || d.endsAtLocal >= d.startsAtLocal, {
    message: 'End must be after start',
    path: ['endsAtLocal'],
  });

/* ------------------------------------------------------------------ */
/*  Response helpers                                                   */
/* ------------------------------------------------------------------ */

function errorJson(
  code: string,
  message: string,
  status: number,
  extra?: { details?: unknown; headers?: Record<string, string> },
): Response {
  const body: Record<string, unknown> = { ok: false, error: { code, message } };
  if (extra?.details) (body.error as Record<string, unknown>).details = extra.details;
  const init: ResponseInit = { status };
  if (extra?.headers) init.headers = extra.headers;
  return Response.json(body, init);
}

function rateLimitResponse(retryAfterSeconds: number, message: string): Response {
  return errorJson('RATE_LIMIT', message, 429, {
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

/* ------------------------------------------------------------------ */
/*  Turnstile verification                                             */
/* ------------------------------------------------------------------ */

async function verifyTurnstile(token: string, secretKey: string): Promise<boolean> {
  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: secretKey, response: token }),
  });
  const data = (await resp.json()) as { success: boolean };
  return data.success;
}

async function insertSubmission(
  data: z.infer<typeof submissionSchema>,
  startsAtUtc: Date,
  endsAtUtc: Date | null,
  ipHash: string | null,
): Promise<{ id: string }> {
  const candidate: EventRowCandidate = {
    source_id: null as unknown as string,
    external_id: null as unknown as string,
    title: data.title,
    description: data.description ?? null,
    description_html: null,
    starts_at_utc: startsAtUtc,
    ends_at_utc: endsAtUtc,
    tzid: data.tzid,
    all_day: data.allDay,
    venue_name: data.venueName ?? null,
    venue_address: data.venueAddress ?? null,
    region: data.region,
    lat: null,
    lng: null,
    url: data.url ?? null,
    image_url: data.imageUrl ?? null,
    category: data.category,
    tags: data.tags,
    dedupe_key: '',
  };

  candidate.dedupe_key = computeDedupeKey(candidate);
  const dedupeCtx: FuzzyDedupeContext = { db, log: log.child({ op: 'submission-dedupe' }) };
  const dedupeResults = await findFuzzyCandidates(candidate, dedupeCtx);

  const now = new Date();
  const [row] = await db
    .insert(events)
    .values({
      ...candidate,
      source_id: null,
      external_id: null,
      status: 'pending_review',
      dedup_candidates: dedupeResults,
      submitter_email: data.submitterEmail,
      submitter_ip_hash: ipHash,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: events.id });

  if (!row) throw new Error('Insert succeeded but returned no row');
  return row;
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: Request): Promise<Response> {
  const logger = log.child({ route: 'POST /api/submissions' });

  try {
    // ── Step 1: Optional Turnstile ────────────────────────────────────
    const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY;
    const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;

    if (turnstileSiteKey && turnstileSecretKey) {
      const token = request.headers.get('cf-turnstile-response');
      if (!token) {
        return errorJson('TURNSTILE_REQUIRED', 'Turnstile token required', 401);
      }
      const valid = await verifyTurnstile(token, turnstileSecretKey);
      if (!valid) {
        return errorJson('TURNSTILE_FAILED', 'Turnstile verification failed', 401);
      }
    }

    // ── Step 2: Parse body ────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorJson('INVALID_JSON', 'Request body must be valid JSON', 422);
    }

    const parsed = submissionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return errorJson('VALIDATION_ERROR', 'Invalid submission', 422, { details });
    }

    const data = parsed.data;

    // ── Step 3: Honeypot ──────────────────────────────────────────────
    if (data.hp_url !== '') {
      // Silently discard -- do not reveal the honeypot
      return new Response(null, { status: 204 });
    }

    // ── Step 4: Dwell check ───────────────────────────────────────────
    const now = Date.now();
    const clientStarted = new Date(data.clientStartedAt).getTime();
    const dwellMs = now - clientStarted;

    if (dwellMs < 4_000 || dwellMs > 3_600_000) {
      return errorJson(
        'DWELL_CHECK_FAILED',
        dwellMs < 4_000 ? 'Form submitted too quickly' : 'Form session expired',
        422,
      );
    }

    // ── Step 5: Global rate limit ─────────────────────────────────────
    const globalResult = await checkAndIncrementGlobal();
    if (!globalResult.allowed) {
      return rateLimitResponse(
        globalResult.retryAfterSeconds,
        'Too many submissions. Please try again later.',
      );
    }

    // ── Step 6: Per-IP rate limit ─────────────────────────────────────
    const clientIp = getClientIp(request);
    const ipHash = clientIp ? hashIp(clientIp) : null;

    if (ipHash) {
      const ipResult = await checkAndIncrement(ipHash);
      if (!ipResult.allowed) {
        return rateLimitResponse(
          ipResult.retryAfterSeconds,
          'Too many submissions from this IP. Please try again later.',
        );
      }
    }

    // ── Step 7: Convert local times to UTC ────────────────────────────
    const startsAtUtc = toUtc(data.startsAtLocal, data.tzid);
    const endsAtUtc = data.endsAtLocal ? toUtc(data.endsAtLocal, data.tzid) : null;

    // ── Steps 8-9: Build candidate, dedupe, persist ─────────────────
    const inserted = await insertSubmission(data, startsAtUtc, endsAtUtc, ipHash);

    logger.info('Public submission accepted', {
      eventId: inserted.id,
      submitterEmail: data.submitterEmail,
    });

    // ── Step 10: Return 201 ───────────────────────────────────────────
    return Response.json({ ok: true, data: { id: inserted.id } }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Submission handler error', {
      error: err instanceof Error ? err.message : String(err),
    });

    return errorJson('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
}
