import { auth } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/clerk';
import { db } from '@/lib/db/client';
import { auditLog, events } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { adminEventPatchSchema, uuidParamSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { sessionClaims } = await auth();
  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : 'unknown@admin';

  if (email === 'unknown@admin') {
    log.warn('Admin session missing email claim; falling back to unknown@admin', {
      sessionClaims: sessionClaims as Record<string, unknown>,
    });
  }

  // Validate route param
  const resolved = await params;
  const paramsParsed = uuidParamSchema.safeParse({ id: resolved.id });
  if (!paramsParsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid event id: must be a UUID',
        },
      },
      { status: 422 },
    );
  }

  const { id } = paramsParsed.data;

  // Parse request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
      },
      { status: 422 },
    );
  }

  const parsed = adminEventPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      },
      { status: 422 },
    );
  }

  const patch = parsed.data;

  try {
    // Load current row
    const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);

    const current = rows[0];
    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        },
        { status: 404 },
      );
    }

    // Compute before/after diff (only changed fields)
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const updateSet: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const dbKey = key as keyof typeof current;
      const currentVal = current[dbKey];

      // Normalise for comparison: convert Date -> ISO string
      const currentNorm = currentVal instanceof Date ? currentVal.toISOString() : currentVal;
      const newNorm = value;

      // Compare arrays by JSON
      const currentStr = JSON.stringify(currentNorm);
      const newStr = JSON.stringify(newNorm);

      if (currentStr !== newStr) {
        before[key] = currentNorm;
        after[key] = newNorm;
        // Convert ISO strings back to Date objects for timestamp columns
        if (
          (key === 'starts_at_utc' || key === 'ends_at_utc' || key === 'published_at') &&
          typeof value === 'string'
        ) {
          updateSet[key] = new Date(value);
        } else {
          updateSet[key] = value;
        }
      }
    }

    // Only perform update if there are actual changes
    if (Object.keys(updateSet).length > 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(events)
          .set({ ...updateSet, updated_at: sql`now()` })
          .where(eq(events.id, id));

        await tx.insert(auditLog).values({
          actor_email: email,
          action: 'event.edit',
          target_type: 'event',
          target_id: id,
          before,
          after,
        });
      });
    }

    // Cache invalidation
    revalidateTag('events:list', 'max');
    const statusInvolved = patch.status ?? current.status;
    if (statusInvolved === 'published' || current.status === 'published') {
      revalidatePath(`/events/${id}`);
    }

    return NextResponse.json({ ok: true, data: { id } });
  } catch (err: unknown) {
    log.error('PATCH /api/admin/events/[id] failed', {
      eventId: id,
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
