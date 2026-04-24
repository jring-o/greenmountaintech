import { auth } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/clerk';
import { db } from '@/lib/db/client';
import { auditLog, events } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { uuidParamSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { sessionClaims } = await auth();
  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : 'unknown@admin';

  if (email === 'unknown@admin') {
    log.warn('Admin session missing email claim; falling back to unknown@admin', {
      sessionClaims: sessionClaims as Record<string, unknown>,
    });
  }

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

    const before = { status: current.status };
    const afterData = { status: 'rejected' };

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({
          status: 'rejected',
          updated_at: sql`now()`,
        })
        .where(eq(events.id, id));

      await tx.insert(auditLog).values({
        actor_email: email,
        action: 'event.reject',
        target_type: 'event',
        target_id: id,
        before,
        after: afterData,
      });
    });

    // Cache invalidation
    revalidateTag('events:list', 'max');
    if (current.status === 'published') {
      revalidatePath(`/events/${id}`);
    }

    return NextResponse.json({
      ok: true,
      data: { id, status: 'rejected' },
    });
  } catch (err: unknown) {
    log.error('POST /api/admin/events/[id]/reject failed', {
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
