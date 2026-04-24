/**
 * lib/ingest/dedupe.ts -- Dedupe key computation and fuzzy dedupe scoring.
 *
 * The dedupe_key is a cheap exact-match composite:
 *   slugify(title) + '|' + format(startsAtUtc in tzid, 'yyyy-MM-dd') + '|' + slugify(venueName ?? '')
 *
 * Fuzzy dedupe (S31) uses fuzzball.js token_set_ratio for title/venue scoring,
 * combined with a time proximity score, to detect near-duplicate events.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { and, between, inArray, ne } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { token_set_ratio } from 'fuzzball';

import type { Logger } from '@/lib/adapters/types';
import { events } from '@/lib/db/schema';
import type { EventRowCandidate } from '@/lib/ingest/normalize';

/* ------------------------------------------------------------------ */
/*  slugify                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lowercase, NFD-normalize, strip diacritics, replace non-[a-z0-9]+ runs
 * with `-`, collapse consecutive hyphens, and trim leading/trailing hyphens.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // non-alnum runs -> hyphen
    .replace(/-{2,}/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

/* ------------------------------------------------------------------ */
/*  computeDedupeKey                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build the composite dedupe key for exact-match dedup:
 *   slugify(title) | yyyy-MM-dd (in candidate tzid) | slugify(venueName)
 */
export function computeDedupeKey(candidate: EventRowCandidate): string {
  const titleSlug = slugify(candidate.title);
  const dateStr = formatInTimeZone(candidate.starts_at_utc, candidate.tzid, 'yyyy-MM-dd');
  const venueSlug = slugify(candidate.venue_name ?? '');
  return `${titleSlug}|${dateStr}|${venueSlug}`;
}

/* ------------------------------------------------------------------ */
/*  Fuzzy dedupe types                                                  */
/* ------------------------------------------------------------------ */

export type FuzzyCandidate = {
  id: string;
  score: number;
  titleScore: number;
  venueScore: number;
  timeScore: number;
  reason: string;
};

export type FuzzyDedupeContext = {
  db: NeonHttpDatabase<Record<string, unknown>>;
  log: Logger;
};

/* ------------------------------------------------------------------ */
/*  Text normalization for fuzzy scoring                                */
/* ------------------------------------------------------------------ */

/**
 * Normalize text for fuzzy comparison: lowercase, strip punctuation,
 * collapse whitespace.
 */
export function normalizeForScoring(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Scoring helpers                                                     */
/* ------------------------------------------------------------------ */

const TITLE_WEIGHT = 0.55;
const VENUE_WEIGHT = 0.3;
const TIME_WEIGHT = 0.15;

/**
 * Compute the weighted composite score between a candidate and an existing event.
 */
export function computeFuzzyScore(
  candidateTitle: string,
  candidateVenue: string | null,
  candidateStartsUtc: Date,
  existingTitle: string,
  existingVenue: string | null,
  existingStartsUtc: Date,
): { score: number; titleScore: number; venueScore: number; timeScore: number } {
  // Title score: token_set_ratio on normalized strings, 0-100 -> 0-1
  const titleScore =
    token_set_ratio(normalizeForScoring(candidateTitle), normalizeForScoring(existingTitle)) / 100;

  // Venue score: token_set_ratio on slugified venues if both present, else 0.5 neutral
  let venueScore: number;
  if (candidateVenue && existingVenue) {
    venueScore = token_set_ratio(slugify(candidateVenue), slugify(existingVenue)) / 100;
  } else {
    venueScore = 0.5;
  }

  // Time score: 1 - min(1, abs(deltaMinutes) / 60)
  const deltaMs = Math.abs(candidateStartsUtc.getTime() - existingStartsUtc.getTime());
  const deltaMinutes = deltaMs / 60_000;
  const timeScore = 1 - Math.min(1, deltaMinutes / 60);

  // Weighted composite
  const score = titleScore * TITLE_WEIGHT + venueScore * VENUE_WEIGHT + timeScore * TIME_WEIGHT;

  return { score, titleScore, venueScore, timeScore };
}

/* ------------------------------------------------------------------ */
/*  findFuzzyCandidates                                                 */
/* ------------------------------------------------------------------ */

/**
 * Query the database for events within +/-60 minutes and on the same calendar
 * day, then score each against the candidate using the weighted composite.
 * Returns scored candidates sorted by score descending.
 */
export async function findFuzzyCandidates(
  candidate: EventRowCandidate,
  ctx: FuzzyDedupeContext,
): Promise<FuzzyCandidate[]> {
  const startsMs = candidate.starts_at_utc.getTime();
  const windowLow = new Date(startsMs - 60 * 60_000);
  const windowHigh = new Date(startsMs + 60 * 60_000);

  // Compute the candidate's calendar day in its timezone
  const candidateDay = formatInTimeZone(candidate.starts_at_utc, candidate.tzid, 'yyyy-MM-dd');

  // Query: status in (published, pending_review), starts_at_utc within +/-60min
  const rows = await ctx.db
    .select({
      id: events.id,
      title: events.title,
      venue_name: events.venue_name,
      starts_at_utc: events.starts_at_utc,
      tzid: events.tzid,
      source_id: events.source_id,
    })
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'pending_review']),
        between(events.starts_at_utc, windowLow, windowHigh),
        ne(events.source_id, candidate.source_id),
      ),
    );

  const results: FuzzyCandidate[] = [];

  for (const row of rows) {
    // Same calendar day check: compare day in the candidate's timezone
    const rowDay = formatInTimeZone(row.starts_at_utc, candidate.tzid, 'yyyy-MM-dd');
    if (rowDay !== candidateDay) continue;

    const { score, titleScore, venueScore, timeScore } = computeFuzzyScore(
      candidate.title,
      candidate.venue_name,
      candidate.starts_at_utc,
      row.title,
      row.venue_name,
      row.starts_at_utc,
    );

    const reason = [
      'title=' + titleScore.toFixed(2),
      'venue=' + venueScore.toFixed(2),
      'time=' + timeScore.toFixed(2),
      'total=' + score.toFixed(3),
    ].join(' ');

    results.push({
      id: row.id,
      score,
      titleScore,
      venueScore,
      timeScore,
      reason,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  ctx.log.debug('Fuzzy candidate scoring complete', {
    candidateTitle: candidate.title,
    candidateCount: results.length,
  });

  return results;
}

/* ------------------------------------------------------------------ */
/*  bestFuzzyCandidate                                                  */
/* ------------------------------------------------------------------ */

/**
 * Return the highest-scoring fuzzy candidate, or null if none found.
 */
export async function bestFuzzyCandidate(
  candidate: EventRowCandidate,
  ctx: FuzzyDedupeContext,
): Promise<FuzzyCandidate | null> {
  const candidates = await findFuzzyCandidates(candidate, ctx);
  if (candidates.length === 0) return null;
  return candidates[0]!;
}
