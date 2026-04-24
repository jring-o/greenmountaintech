import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/clerk';
import { db } from '@/lib/db/client';
import { auditLog, sources } from '@/lib/db/schema';
import { runOne } from '@/lib/ingest/runner';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Auth guard -- 404 on unauthorized
  await requireAdmin();

  // Retrieve admin email for audit log
  const { sessionClaims } = await auth();
  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : 'unknown@admin';

  // F7: Warn when email is missing from session claims
  if (email === 'unknown@admin') {
    log.warn('Admin session missing email claim; falling back to unknown@admin', {
      sessionClaims: sessionClaims as Record<string, unknown>,
    });
  }

  // Validate params.id is a UUID
  const resolved = await params;
  const parsed = ParamsSchema.safeParse({ id: resolved.id });
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid source id: must be a UUID',
        },
      },
      { status: 422 },
    );
  }

  const { id } = parsed.data;

  // Load source row -- 404 if not found
  const rows = await db.select().from(sources).where(eq(sources.id, id)).limit(1);

  const source = rows[0];
  if (!source) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Source not found',
        },
      },
      { status: 404 },
    );
  }

  // F1: Wrap main operations in try/catch
  try {
    // Run ingestion for this source
    const summary = await runOne(id, 'manual', email);

    // F5: Audit log is best-effort -- do not block success response
    try {
      await db.insert(auditLog).values({
        actor_email: email,
        action: 'source.run_now',
        target_type: 'source',
        target_id: id,
      });
    } catch (auditErr: unknown) {
      log.warn('Failed to write audit log for source.run_now', {
        sourceId: id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    // Invalidate cache (Next 16 requires tag + cache profile)
    revalidateTag('events:list', 'max');

    return NextResponse.json({ ok: true, data: summary });
  } catch (err: unknown) {
    log.error('Admin run-now failed', {
      sourceId: id,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 },
    );
  }
}
