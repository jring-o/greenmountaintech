import { NextRequest, NextResponse } from 'next/server';

import { PublicEventsQuerySchema, listPublicEvents } from '@/lib/db/queries/events';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 's-maxage=60, stale-while-revalidate=300';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const parsed = PublicEventsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details,
        },
      },
      { status: 422 },
    );
  }

  try {
    const result = await listPublicEvents(parsed.data);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    });
  } catch (err) {
    log.error('Public events query failed', {
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
