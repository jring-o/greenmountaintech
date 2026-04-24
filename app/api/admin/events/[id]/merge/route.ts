import { auth } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/clerk';
import { db } from '@/lib/db/client';
import { auditLog, events } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { uuidParamSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const MergeBodySchema = z.object({
  targetId: z.string().uuid(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Parse body
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

  const bodyParsed = MergeBodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: bodyParsed.error.issues.map((i) => i.message).join('; '),
        },
      },
      { status: 422 },
    );
  }

  const { targetId } = bodyParsed.data;

  // Cannot merge into self
  if (targetId === id) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot merge an event into itself',
        },
      },
      { status: 422 },
    );
  }

  try {
    // Load source event
    const sourceRows = await db.select().from(events).where(eq(events.id, id)).limit(1);

    const current = sourceRows[0];
    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        },
        { status: 404 },
      );
    }

    // Validate target exists and is published
    const targetRows = await db.select().from(events).where(eq(events.id, targetId)).limit(1);

    const target = targetRows[0];
    if (!target || target.status !== 'published') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Target event must exist and be published',
          },
        },
        { status: 422 },
      );
    }

    const before = {
      status: current.status,
      merged_into: current.merged_into,
    };
    const afterData = {
      status: 'duplicate',
      merged_into: targetId,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({
          status: 'duplicate',
          merged_into: targetId,
          updated_at: sql`now()`,
        })
        .where(eq(events.id, id));

      await tx.insert(auditLog).values({
        actor_email: email,
        action: 'event.merge',
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
      data: { id, status: 'duplicate', mergedInto: targetId },
    });
  } catch (err: unknown) {
    log.error('POST /api/admin/events/[id]/merge failed', {
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
