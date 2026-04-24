import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/clerk';
import { listRuns } from '@/lib/db/queries/runs';
import { log } from '@/lib/log';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 25, 1), 100) : 25;

  try {
    const page = await listRuns({ ...(cursor !== undefined ? { cursor } : {}), limit });
    return NextResponse.json({ ok: true, data: page });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Invalid cursor -> 422; everything else -> 500
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

    log.error('GET /api/admin/runs failed', { error: message });
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
