/**
 * lib/ingest/persist.ts -- Event persistence with exact-match dedupe and trust routing.
 *
 * All writes happen inside a transaction at READ COMMITTED (Drizzle default).
 * The `(source_id, external_id)` unique constraint protects against concurrent re-ingest.
 *
 * Fuzzy dedupe (S31) uses bestFuzzyCandidate to score near-matches and applies
 * DEDUPE_AUTO_THRESHOLD / DEDUPE_REVIEW_THRESHOLD to decide the outcome.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';

import type { Logger } from '@/lib/adapters/types';
import { events } from '@/lib/db/schema';
import type { SourceRow } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { bestFuzzyCandidate } from '@/lib/ingest/dedupe';
import type { EventRowCandidate } from '@/lib/ingest/normalize';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type PersistResult =
  | 'inserted'
  | 'updated'
  | 'unchanged'
  | 'duplicate'
  | 'queued_for_review'
  | 'error'
  | 'dedup_skipped';

export type PersistContext = {
  db: NeonDatabase<Record<string, unknown>>;
  log: Logger;
  now: () => Date;
};

/* ------------------------------------------------------------------ */
/*  Trust routing (section 10.1)                                        */
/* ------------------------------------------------------------------ */

/**
 * Determine the initial event status based on source kind and trust level.
 */
function resolveStatus(source: SourceRow): 'published' | 'pending_review' {
  if (
    (source.kind === 'whitelist' || source.kind === 'admin_added') &&
    source.trust_level === 'auto_publish'
  ) {
    return 'published';
  }
  return 'pending_review';
}

/* ------------------------------------------------------------------ */
/*  Shared column helpers                                               */
/* ------------------------------------------------------------------ */

/** All event columns sourced from the candidate (shared by insert & update). */
function candidateColumns(candidate: EventRowCandidate) {
  return {
    source_id: candidate.source_id,
    external_id: candidate.external_id,
    title: candidate.title,
    description: candidate.description,
    description_html: candidate.description_html,
    starts_at_utc: candidate.starts_at_utc,
    ends_at_utc: candidate.ends_at_utc,
    tzid: candidate.tzid,
    all_day: candidate.all_day,
    venue_name: candidate.venue_name,
    venue_address: candidate.venue_address,
    region: candidate.region,
    lat: candidate.lat,
    lng: candidate.lng,
    url: candidate.url,
    image_url: candidate.image_url,
    category: candidate.category,
    tags: candidate.tags,
    dedupe_key: candidate.dedupe_key,
  };
}

/** Subset of candidate columns safe to overwrite on re-ingest, plus updated_at. */
function mutableFields(candidate: EventRowCandidate) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { source_id: _source_id, external_id: _external_id, ...rest } = candidateColumns(candidate);
  return { ...rest, updated_at: sql`now()` };
}

/* ------------------------------------------------------------------ */
/*  persistEvent                                                        */
/* ------------------------------------------------------------------ */

/**
 * Persist an EventRowCandidate, implementing the section 14 algorithm:
 *
 * 1. Match by (source_id, external_id) -> update
 * 2. Match by dedupe_key -> mark duplicate
 * 3. Fuzzy dedupe -> auto-merge, queue for review, or proceed
 * 4. Trust routing -> insert
 *
 * Returns a PersistResult tag indicating what happened.
 */
export async function persistEvent(
  candidate: EventRowCandidate,
  source: SourceRow,
  ctx: PersistContext,
): Promise<PersistResult> {
  return ctx.db.transaction(async (tx) => {
    // ── Step 1: Match by (source_id, external_id) ──────────────────
    const existingByExternalId = await tx
      .select()
      .from(events)
      .where(
        and(
          eq(events.source_id, candidate.source_id),
          eq(events.external_id, candidate.external_id),
        ),
      )
      .limit(1);

    if (existingByExternalId.length > 0) {
      return handleExistingEvent(existingByExternalId[0]!, candidate, ctx, tx);
    }

    // ── Step 2: Exact dedupe_key match ─────────────────────────────
    const dedupeMatches = await tx
      .select()
      .from(events)
      .where(and(eq(events.dedupe_key, candidate.dedupe_key), ne(events.status, 'rejected')));

    const crossSourceMatch = dedupeMatches.find((m) => m.source_id !== candidate.source_id);

    if (
      crossSourceMatch &&
      (crossSourceMatch.status === 'published' || crossSourceMatch.status === 'pending_review')
    ) {
      const now = ctx.now();
      await tx.insert(events).values({
        ...candidateColumns(candidate),
        status: 'duplicate',
        merged_into: crossSourceMatch.id,
        created_at: now,
        updated_at: now,
      });

      ctx.log.debug('Inserted as duplicate (exact dedupe_key match)', {
        mergedInto: crossSourceMatch.id,
      });
      return 'duplicate';
    }

    // ── Step 2 (cont): Fuzzy dedupe ────────────────────────────────
    const fuzzyBest = await bestFuzzyCandidate(candidate, {
      db: tx as unknown as typeof ctx.db,
      log: ctx.log,
    });

    if (fuzzyBest) {
      const now = ctx.now();

      if (fuzzyBest.score >= env.DEDUPE_AUTO_THRESHOLD) {
        // Auto soft-merge: insert as duplicate pointing to canonical
        await tx.insert(events).values({
          ...candidateColumns(candidate),
          status: 'duplicate',
          merged_into: fuzzyBest.id,
          created_at: now,
          updated_at: now,
        });

        ctx.log.debug('Inserted as duplicate (fuzzy auto-merge)', {
          mergedInto: fuzzyBest.id,
          score: fuzzyBest.score,
          reason: fuzzyBest.reason,
        });
        return 'duplicate';
      }

      if (fuzzyBest.score >= env.DEDUPE_REVIEW_THRESHOLD) {
        // Queue for review with dedup_candidates metadata
        await tx.insert(events).values({
          ...candidateColumns(candidate),
          status: 'pending_review',
          dedup_candidates: [
            {
              id: fuzzyBest.id,
              score: fuzzyBest.score,
              titleScore: fuzzyBest.titleScore,
              venueScore: fuzzyBest.venueScore,
              timeScore: fuzzyBest.timeScore,
              reason: fuzzyBest.reason,
            },
          ],
          created_at: now,
          updated_at: now,
        });

        ctx.log.debug('Inserted as pending_review (fuzzy review)', {
          candidateId: fuzzyBest.id,
          score: fuzzyBest.score,
          reason: fuzzyBest.reason,
        });
        return 'queued_for_review';
      }
    }

    // ── Step 3: Trust routing ──────────────────────────────────────
    const status = resolveStatus(source);
    const now = ctx.now();
    const publishedAt = status === 'published' ? now : null;

    // ── Step 4: Insert ─────────────────────────────────────────────
    await tx.insert(events).values({
      ...candidateColumns(candidate),
      status,
      published_at: publishedAt,
      created_at: now,
      updated_at: now,
    });

    ctx.log.info('Inserted new event', {
      title: candidate.title,
      status,
      externalId: candidate.external_id,
    });
    return 'inserted';
  });
}

/* ------------------------------------------------------------------ */
/*  Step 1 sub-handler: re-ingest of known event                        */
/* ------------------------------------------------------------------ */

async function handleExistingEvent(
  existing: { id: string; status: string; merged_into: string | null },
  candidate: EventRowCandidate,
  ctx: PersistContext,
  tx: Parameters<Parameters<PersistContext['db']['transaction']>[0]>[0],
): Promise<PersistResult> {
  // Section 10.2: If rejected, skip entirely
  if (existing.status === 'rejected') {
    ctx.log.debug('Skipping rejected event on re-ingest', {
      eventId: existing.id,
      externalId: candidate.external_id,
    });
    return 'dedup_skipped';
  }

  // Section 10.2: If duplicate, refresh fields on the canonical
  if (existing.status === 'duplicate' && existing.merged_into) {
    await tx
      .update(events)
      .set(mutableFields(candidate))
      .where(eq(events.id, existing.merged_into));
    ctx.log.debug('Updated canonical event via duplicate pointer', {
      duplicateId: existing.id,
      canonicalId: existing.merged_into,
    });
    return 'updated';
  }

  // Update mutable fields, preserve status & published_at & merged_into & dedup_candidates
  await tx.update(events).set(mutableFields(candidate)).where(eq(events.id, existing.id));

  ctx.log.debug('Updated existing event', { eventId: existing.id });
  return 'updated';
}
