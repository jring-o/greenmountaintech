import { db } from '@/lib/db/client';
import { auditLog } from '@/lib/db/schema';

export interface WriteAuditParams {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Writes a single row to the audit_log table.
 * Serialises `before` and `after` as JSONB.
 */
export async function writeAudit(params: WriteAuditParams): Promise<void> {
  await db.insert(auditLog).values({
    actor_email: params.actorEmail,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    before: params.before ?? null,
    after: params.after ?? null,
  });
}
