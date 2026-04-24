import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { _registry } from '@/lib/adapters/index';
import { requireAdmin } from '@/lib/auth/clerk';
import { writeAudit } from '@/lib/db/queries/audit';
import { createSource, listSources } from '@/lib/db/queries/sources';
import { log } from '@/lib/log';
import { sourceCreateSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

async function resolveAdminEmail(): Promise<string> {
  const { sessionClaims } = await auth();
  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email : 'unknown@admin';

  if (email === 'unknown@admin') {
    log.warn('Admin session missing email claim; falling back to unknown@admin', {
      sessionClaims: sessionClaims as Record<string, unknown>,
    });
  }
  return email;
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/sources — list sources with optional filters         */
/* ------------------------------------------------------------------ */

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const isActiveParam = url.searchParams.get('is_active');

  const filter: Parameters<typeof listSources>[0] = {};
  if (kindParam === 'whitelist' || kindParam === 'admin_added') {
    filter.kind = kindParam;
  }
  if (isActiveParam === 'true') filter.isActive = true;
  if (isActiveParam === 'false') filter.isActive = false;

  try {
    const rows = await listSources(filter);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err: unknown) {
    log.error('GET /api/admin/sources failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/admin/sources — create a new source                       */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  await requireAdmin();
  const email = await resolveAdminEmail();

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

  // Validate with zod
  const parsed = sourceCreateSchema.safeParse(body);
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

  const input = parsed.data;

  // Validate adapter_key exists in registry
  const registryKey = `${input.adapter_type}:${input.adapter_key}`;
  if (!_registry.has(registryKey)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Unknown adapter_key: "${registryKey}" is not registered`,
        },
      },
      { status: 422 },
    );
  }

  // Validate adapter_config against configSchema if the adapter exposes one
  const adapter = _registry.get(registryKey)!;
  if (adapter.configSchema && input.adapter_config) {
    const configResult = adapter.configSchema.safeParse(input.adapter_config);
    if (!configResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: configResult.error.issues
              .map((i: { message: string }) => i.message)
              .join('; '),
          },
        },
        { status: 422 },
      );
    }
  }

  try {
    const source = await createSource(input);

    // Write audit log (best-effort)
    try {
      await writeAudit({
        actorEmail: email,
        action: 'source.create',
        targetType: 'source',
        targetId: source.id,
        after: input as unknown as Record<string, unknown>,
      });
    } catch (auditErr: unknown) {
      log.warn('Failed to write audit log for source.create', {
        sourceId: source.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({ ok: true, data: source }, { status: 201 });
  } catch (err: unknown) {
    log.error('POST /api/admin/sources failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      },
      { status: 500 },
    );
  }
}
