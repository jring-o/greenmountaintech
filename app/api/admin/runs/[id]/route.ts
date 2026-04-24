import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/clerk';
import { getRunWithItems } from '@/lib/db/queries/runs';
import { log } from '@/lib/log';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const resolved = await params;
  const parsed = ParamsSchema.safeParse({ id: resolved.id });
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid run id: must be a UUID',
        },
      },
      { status: 422 },
    );
  }

  try {
    const detail = await getRunWithItems(parsed.data.id);
    if (!detail) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Run not found',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: detail });
  } catch (err: unknown) {
    log.error('GET /api/admin/runs/[id] failed', {
      runId: parsed.data.id,
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
