import { auth } from '@clerk/nextjs/server';
import { inArray, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/clerk';
import { db } from '@/lib/db/client';
import { listAdminEvents, AdminEventsQuerySchema, BulkActionSchema } from '@/lib/db/queries/events';
import { auditLog, events } from '@/lib/db/schema';
import { log } from '@/lib/log';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const rawParams: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    rawParams[key] = value;
  }

  const parsed = AdminEventsQuerySchema.safeParse(rawParams);
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

  try {
    const page = await listAdminEvents(parsed.data);
    return NextResponse.json({ ok: true, data: page });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.startsWith('Invalid cursor')) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cursor parameter',
          },
        },
        { status: 422 },
      );
    }

    log.error('GET /api/admin/events failed', { error: message });
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

export async function POST(req: Request) {
  await requireAdmin();

  const { sessionClaims } = await auth();
  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : 'unknown@admin';

  if (email === 'unknown@admin') {
    log.warn('Admin session missing email claim; falling back to unknown@admin', {
      sessionClaims: sessionClaims as Record<string, unknown>,
    });
  }

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

  const parsed = BulkActionSchema.safeParse(body);
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

  const { action, ids } = parsed.data;
  const newStatus = action === 'approve' ? 'published' : 'rejected';

  try {
    // Update events
    await db
      .update(events)
      .set({
        status: newStatus,
        ...(action === 'approve' ? { published_at: sql`now()` } : {}),
        updated_at: sql`now()`,
      })
      .where(inArray(events.id, ids));

    // Write audit log entries (best-effort)
    try {
      const auditRows = ids.map((id) => ({
        actor_email: email,
        action: action === 'approve' ? 'event.bulk_approve' : 'event.bulk_reject',
        target_type: 'event' as const,
        target_id: id,
        after: { status: newStatus } as Record<string, unknown>,
      }));
      await db.insert(auditLog).values(auditRows);
    } catch (auditErr: unknown) {
      log.warn('Failed to write audit log for bulk action', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    revalidateTag('events:list', 'max');

    return NextResponse.json({
      ok: true,
      data: { updated: ids.length, status: newStatus },
    });
  } catch (err: unknown) {
    log.error('POST /api/admin/events bulk action failed', {
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
