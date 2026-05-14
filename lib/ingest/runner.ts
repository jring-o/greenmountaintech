/**
 * lib/ingest/runner.ts -- Ingestion runner with bounded concurrency.
 *
 * Exports runAll (full nightly run) and runOne (single-source manual trigger).
 * Enforces a 280s global budget and per-source budget of min(60s, remaining/2).
 */

import { eq, lt, sql } from 'drizzle-orm';
import pLimit from 'p-limit';

import { assertAllSourceAdaptersResolvable } from '@/lib/adapters/boot-check';
import { createFetch } from '@/lib/adapters/helpers/fetch';
import { resolveAdapter } from '@/lib/adapters/index';
import { UnknownAdapterError } from '@/lib/adapters/types';
import type { AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { db } from '@/lib/db/client';
import { sources, ingestionRuns, submissionRateLimits } from '@/lib/db/schema';
import type { SourceRow } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { normalize } from '@/lib/ingest/normalize';
import { persistEvent } from '@/lib/ingest/persist';
import { log } from '@/lib/log';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type RunSummary = {
  sourceId: string;
  runId: string;
  status: 'ok' | 'partial' | 'error';
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsErrored: number;
  itemsDedupSkipped: number;
  durationMs: number;
};

type Counters = {
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsErrored: number;
  itemsDedupSkipped: number;
  errorLog: { message: string; ts: string }[];
};

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const GLOBAL_BUDGET_MS = 280_000;
const PER_SOURCE_MAX_MS = 60_000;
const ERROR_LOG_CAP = 50;

/* ------------------------------------------------------------------ */
/*  runAll                                                              */
/* ------------------------------------------------------------------ */

export async function runAll(
  triggeredBy: 'cron' | 'manual',
  triggeredByEmail?: string,
): Promise<RunSummary[]> {
  const globalStart = Date.now();
  const logger = log.child({ triggeredBy, fn: 'runAll' });

  // Load active sources ordered by last_run_at NULLS FIRST
  const activeSources = await db
    .select()
    .from(sources)
    .where(eq(sources.is_active, true))
    .orderBy(sql`${sources.last_run_at} ASC NULLS FIRST`);

  if (activeSources.length === 0) {
    logger.info('no active sources to ingest');
    return [];
  }

  // Boot check: log warnings for unresolvable adapters
  assertAllSourceAdaptersResolvable(activeSources, logger);

  // Concurrency limiter
  const concurrency = env.INGEST_CONCURRENCY;
  const limit = pLimit(concurrency);

  const summaries = await Promise.all(
    activeSources.map((source) =>
      limit(() => {
        const remaining = GLOBAL_BUDGET_MS - (Date.now() - globalStart);
        if (remaining <= 0) {
          logger.warn('global budget exhausted, skipping source', {
            sourceId: source.id,
            sourceName: source.name,
          });
          return Promise.resolve<RunSummary>({
            sourceId: source.id,
            runId: '',
            status: 'error',
            itemsFound: 0,
            itemsNew: 0,
            itemsUpdated: 0,
            itemsErrored: 0,
            itemsDedupSkipped: 0,
            durationMs: 0,
          });
        }
        const perSourceBudget = Math.min(PER_SOURCE_MAX_MS, remaining / 2);
        return processSource(source, triggeredBy, triggeredByEmail, perSourceBudget, logger);
      }),
    ),
  );

  // Purge stale submission_rate_limits rows (best-effort)
  try {
    await db
      .delete(submissionRateLimits)
      .where(lt(submissionRateLimits.window_started_at, sql`now() - interval '24 hours'`));
    logger.info('purged stale submission_rate_limits rows');
  } catch (err: unknown) {
    logger.warn('failed to purge submission_rate_limits', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return summaries;
}

/* ------------------------------------------------------------------ */
/*  runOne                                                              */
/* ------------------------------------------------------------------ */

export async function runOne(
  sourceId: string,
  triggeredBy: 'cron' | 'manual',
  triggeredByEmail?: string,
): Promise<RunSummary> {
  const logger = log.child({ triggeredBy, fn: 'runOne', sourceId });

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);

  const source = rows[0];
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  return processSource(source, triggeredBy, triggeredByEmail, PER_SOURCE_MAX_MS, logger);
}

/* ------------------------------------------------------------------ */
/*  finalizeRun -- shared DB writes for success & error paths           */
/* ------------------------------------------------------------------ */

async function finalizeRun(
  runId: string,
  sourceId: string,
  status: RunSummary['status'],
  durationMs: number,
  counters: Counters,
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      finished_at: sql`now()`,
      status,
      duration_ms: durationMs,
      items_found: counters.itemsFound,
      items_new: counters.itemsNew,
      items_updated: counters.itemsUpdated,
      items_errored: counters.itemsErrored,
      items_dedup_skipped: counters.itemsDedupSkipped,
      error_log: counters.errorLog,
    })
    .where(eq(ingestionRuns.id, runId));

  await db
    .update(sources)
    .set({
      last_run_at: sql`now()`,
      last_run_status: status,
      consecutive_failures: status === 'ok' ? 0 : sql`${sources.consecutive_failures} + 1`,
      updated_at: sql`now()`,
    })
    .where(eq(sources.id, sourceId));
}

/* ------------------------------------------------------------------ */
/*  deriveStatus                                                        */
/* ------------------------------------------------------------------ */

function deriveStatus(timedOut: boolean, counters: Counters): RunSummary['status'] {
  if (timedOut) {
    return counters.itemsNew > 0 || counters.itemsUpdated > 0 ? 'partial' : 'error';
  }
  if (counters.itemsFound === 0 && counters.errorLog.length > 0) return 'error';
  if (counters.itemsErrored > 0 && (counters.itemsNew > 0 || counters.itemsUpdated > 0)) {
    return 'partial';
  }
  if (counters.itemsErrored > 0) return 'error';
  return 'ok';
}

/* ------------------------------------------------------------------ */
/*  buildSummary                                                        */
/* ------------------------------------------------------------------ */

function buildSummary(
  sourceId: string,
  runId: string,
  status: RunSummary['status'],
  durationMs: number,
  counters: Counters,
): RunSummary {
  return {
    sourceId,
    runId,
    status,
    itemsFound: counters.itemsFound,
    itemsNew: counters.itemsNew,
    itemsUpdated: counters.itemsUpdated,
    itemsErrored: counters.itemsErrored,
    itemsDedupSkipped: counters.itemsDedupSkipped,
    durationMs,
  };
}

/* ------------------------------------------------------------------ */
/*  processEvents -- iterate adapter output, normalize & persist        */
/* ------------------------------------------------------------------ */

async function processEvents(
  source: SourceRow,
  deadline: number,
  budgetMs: number,
  counters: Counters,
  recordError: (msg: string) => void,
  logger: ReturnType<typeof log.child>,
): Promise<boolean> {
  const adapter = resolveAdapter(source);
  const fetchFn = createFetch(source, logger);
  const ctx: AdapterContext = {
    source,
    log: logger,
    fetch: fetchFn,
    now: () => new Date(),
  };

  let timedOut = false;

  for await (const adapterEvent of adapter.ingest(ctx) as AsyncIterable<AdapterEvent>) {
    if (Date.now() >= deadline) {
      timedOut = true;
      logger.warn('per-source budget exceeded, aborting', {
        budgetMs,
        itemsFound: counters.itemsFound,
      });
      break;
    }

    counters.itemsFound += 1;

    try {
      const candidate = normalize(adapterEvent, source, logger);
      const persistCtx = { db, log: logger, now: () => new Date() };
      const result = await persistEvent(candidate, source, persistCtx);

      switch (result) {
        case 'inserted':
        case 'queued_for_review':
          counters.itemsNew += 1;
          break;
        case 'updated':
          counters.itemsUpdated += 1;
          break;
        case 'duplicate':
        case 'dedup_skipped':
        case 'unchanged':
          counters.itemsDedupSkipped += 1;
          break;
        case 'error':
          counters.itemsErrored += 1;
          recordError('persist error for item');
          break;
      }
    } catch (itemErr: unknown) {
      counters.itemsErrored += 1;
      const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
      recordError(msg);
      logger.error('per-item error', { error: msg });
    }
  }

  return timedOut;
}

/* ------------------------------------------------------------------ */
/*  processSource                                                       */
/* ------------------------------------------------------------------ */

async function processSource(
  source: SourceRow,
  triggeredBy: 'cron' | 'manual',
  triggeredByEmail: string | undefined,
  budgetMs: number,
  parentLogger: ReturnType<typeof log.child>,
): Promise<RunSummary> {
  const sourceStart = Date.now();
  const logger = parentLogger.child({
    sourceId: source.id,
    sourceName: source.name,
  });

  logger.info('source ingestion started', { budgetMs });

  const [runRow] = await db
    .insert(ingestionRuns)
    .values({
      source_id: source.id,
      triggered_by: triggeredBy,
      triggered_by_email: triggeredByEmail ?? null,
      status: 'running',
    })
    .returning({ id: ingestionRuns.id });

  const runId = runRow!.id;
  const counters: Counters = {
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    itemsErrored: 0,
    itemsDedupSkipped: 0,
    errorLog: [],
  };
  let overflowWarned = false;

  function recordError(message: string): void {
    if (counters.errorLog.length < ERROR_LOG_CAP) {
      counters.errorLog.push({ message, ts: new Date().toISOString() });
    } else if (!overflowWarned) {
      overflowWarned = true;
      logger.warn('error_log cap reached, further errors not recorded', {
        cap: ERROR_LOG_CAP,
      });
    }
  }

  try {
    const deadline = sourceStart + budgetMs;
    const timedOut = await processEvents(source, deadline, budgetMs, counters, recordError, logger);

    const status = deriveStatus(timedOut, counters);
    const durationMs = Date.now() - sourceStart;

    await finalizeRun(runId, source.id, status, durationMs, counters);

    logger.info('source ingestion finished', {
      status,
      durationMs,
      itemsFound: counters.itemsFound,
      itemsNew: counters.itemsNew,
      itemsUpdated: counters.itemsUpdated,
      itemsErrored: counters.itemsErrored,
      itemsDedupSkipped: counters.itemsDedupSkipped,
    });

    return buildSummary(source.id, runId, status, durationMs, counters);
  } catch (err: unknown) {
    const durationMs = Date.now() - sourceStart;
    const isUnknownAdapter = err instanceof UnknownAdapterError;
    const msg = err instanceof Error ? err.message : String(err);

    recordError(msg);

    await finalizeRun(runId, source.id, 'error', durationMs, counters);

    logger.error('source ingestion failed', {
      error: msg,
      isUnknownAdapter,
      durationMs,
    });

    return buildSummary(source.id, runId, 'error', durationMs, counters);
  }
}
