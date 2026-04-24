import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { _registry } from '@/lib/adapters/index';
import { requireAdmin } from '@/lib/auth/clerk';
import { writeAudit } from '@/lib/db/queries/audit';
import { getSource, softDeleteSource, updateSource } from '@/lib/db/queries/sources';
import { log } from '@/lib/log';
import { sourcePatchSchema, uuidParamSchema } from '@/lib/validation/schemas';

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

function parseUuidParam(resolved: { id: string }): { id: string } | Response {
  const paramsParsed = uuidParamSchema.safeParse({ id: resolved.id });
  if (!paramsParsed.success) {
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
  return paramsParsed.data;
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/admin/sources/[id] — update a source                     */
/* ------------------------------------------------------------------ */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const email = await resolveAdminEmail();

  // Validate route param
  const resolved = await params;
  const paramResult = parseUuidParam(resolved);
  if (paramResult instanceof Response) return paramResult;

  const { id } = paramResult;

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

  const parsed = sourcePatchSchema.safeParse(body);
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
    const current = await getSource(id);
    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Source not found' },
        },
        { status: 404 },
      );
    }

    // If adapter_key or adapter_type changed, validate registry
    const adapterType = patch.adapter_type ?? current.adapter_type;
    const adapterKey = patch.adapter_key ?? current.adapter_key;
    if (patch.adapter_type !== undefined || patch.adapter_key !== undefined) {
      const registryKey = `${adapterType}:${adapterKey}`;
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
    }

    // Validate adapter_config against configSchema if provided
    const registryKey = `${adapterType}:${adapterKey}`;
    const adapterEntry = _registry.get(registryKey);
    if (patch.adapter_config !== undefined && adapterEntry?.configSchema) {
      const configResult = adapterEntry.configSchema.safeParse(patch.adapter_config);
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

    // Determine audit action
    const isDisabling = patch.is_active === false && current.is_active === true;
    const isEnabling = patch.is_active === true && current.is_active === false;

    // Strip undefined values so exactOptionalPropertyTypes is satisfied
    const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

    const updated = await updateSource(id, cleanPatch);

    // Write audit log (best-effort)
    try {
      const action = isDisabling
        ? 'source.disable'
        : isEnabling
          ? 'source.enable'
          : 'source.update';

      await writeAudit({
        actorEmail: email,
        action,
        targetType: 'source',
        targetId: id,
        before: current as unknown as Record<string, unknown>,
        after: patch as unknown as Record<string, unknown>,
      });
    } catch (auditErr: unknown) {
      log.warn('Failed to write audit log for source update', {
        sourceId: id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: unknown) {
    log.error('PATCH /api/admin/sources/[id] failed', {
      sourceId: id,
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
/*  DELETE /api/admin/sources/[id] — soft-delete (is_active = false)    */
/* ------------------------------------------------------------------ */

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const email = await resolveAdminEmail();

  // Validate route param
  const resolved = await params;
  const paramResult = parseUuidParam(resolved);
  if (paramResult instanceof Response) return paramResult;

  const { id } = paramResult;

  try {
    const current = await getSource(id);
    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Source not found' },
        },
        { status: 404 },
      );
    }

    const updated = await softDeleteSource(id);

    // Write audit log (best-effort)
    try {
      await writeAudit({
        actorEmail: email,
        action: 'source.disable',
        targetType: 'source',
        targetId: id,
        before: { is_active: current.is_active },
        after: { is_active: false },
      });
    } catch (auditErr: unknown) {
      log.warn('Failed to write audit log for source.disable', {
        sourceId: id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: unknown) {
    log.error('DELETE /api/admin/sources/[id] failed', {
      sourceId: id,
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
