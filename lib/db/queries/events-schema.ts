/**
 * Pure utilities for the public events API: cursor encode/decode,
 * Zod query schema, and response type definitions.
 *
 * This module has NO side-effects (no DB/env imports) so it can be
 * safely imported in unit tests without triggering env validation.
 */

import { z } from 'zod';

import { regionEnum, eventCategoryEnum, eventStatusEnum } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Shared cursor encode/decode                                         */
/* ------------------------------------------------------------------ */

function encodeCursorPayload(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursorPayload<T extends Record<string, string>>(
  cursor: string,
  dateField: string,
  requiredFields: string[],
): T {
  const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid cursor payload');
  }
  const obj = parsed as Record<string, unknown>;
  for (const field of requiredFields) {
    if (!(field in obj) || typeof obj[field] !== 'string') {
      throw new Error('Invalid cursor payload');
    }
  }
  const d = new Date(obj[dateField] as string);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid cursor date');
  }
  return obj as unknown as T;
}

/* ------------------------------------------------------------------ */
/*  Public cursor helpers                                               */
/* ------------------------------------------------------------------ */

type CursorPayload = {
  starts_at_utc: string; // ISO-8601 UTC
  id: string; // UUID
};

export function encodeCursor(startsAtUtc: Date, id: string): string {
  return encodeCursorPayload({ starts_at_utc: startsAtUtc.toISOString(), id });
}

export function decodeCursor(cursor: string): CursorPayload {
  return decodeCursorPayload<CursorPayload>(cursor, 'starts_at_utc', ['starts_at_utc', 'id']);
}

/* ------------------------------------------------------------------ */
/*  FTS cursor helpers (keyed on rank DESC, starts_at_utc ASC, id ASC) */
/* ------------------------------------------------------------------ */

type FtsCursorPayload = {
  rank: string; // stringified float
  starts_at_utc: string; // ISO-8601 UTC
  id: string; // UUID
};

export function encodeFtsCursor(rank: number, startsAtUtc: Date, id: string): string {
  return encodeCursorPayload({
    rank: String(rank),
    starts_at_utc: startsAtUtc.toISOString(),
    id,
  });
}

export function decodeFtsCursor(cursor: string): FtsCursorPayload {
  const payload = decodeCursorPayload<FtsCursorPayload>(cursor, 'starts_at_utc', [
    'rank',
    'starts_at_utc',
    'id',
  ]);
  if (isNaN(Number(payload.rank))) {
    throw new Error('Invalid cursor rank');
  }
  return payload;
}

/* ------------------------------------------------------------------ */
/*  Admin cursor helpers (keyed on created_at DESC, id DESC)            */
/* ------------------------------------------------------------------ */

type AdminCursorPayload = {
  created_at: string; // ISO-8601 UTC
  id: string; // UUID
};

export function encodeAdminCursor(createdAt: Date, id: string): string {
  return encodeCursorPayload({ created_at: createdAt.toISOString(), id });
}

export function decodeAdminCursor(cursor: string): AdminCursorPayload {
  return decodeCursorPayload<AdminCursorPayload>(cursor, 'created_at', ['created_at', 'id']);
}

/* ------------------------------------------------------------------ */
/*  Zod schema for query params                                         */
/* ------------------------------------------------------------------ */

const MAX_RANGE_DAYS = 366;

const isoDatetime = z.string().refine(
  (s) => {
    const d = new Date(s);
    return !isNaN(d.getTime());
  },
  { message: 'Invalid ISO datetime' },
);

export const PublicEventsQuerySchema = z
  .object({
    from: isoDatetime.optional(),
    to: isoDatetime.optional(),
    region: z.enum(regionEnum.enumValues).optional(),
    category: z.enum(eventCategoryEnum.enumValues).optional(),
    q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(250),
    cursor: z.string().optional(),
  })
  .transform((val) => {
    const fromDate = val.from ? new Date(val.from) : new Date();
    const toDefault = new Date(fromDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const toDate = val.to ? new Date(val.to) : toDefault;
    return {
      ...val,
      fromDate,
      toDate,
    };
  })
  .refine(
    (val) => {
      const diffMs = val.toDate.getTime() - val.fromDate.getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      return diffDays <= MAX_RANGE_DAYS;
    },
    {
      message: `Date range must not exceed ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    },
  );

export type PublicEventsQuery = z.infer<typeof PublicEventsQuerySchema>;

/* ------------------------------------------------------------------ */
/*  Admin events query schema                                           */
/* ------------------------------------------------------------------ */

export const AdminEventsQuerySchema = z.object({
  status: z.enum(eventStatusEnum.enumValues).optional(),
  region: z.enum(regionEnum.enumValues).optional(),
  category: z.enum(eventCategoryEnum.enumValues).optional(),
  q: z.string().max(100).optional(),
  from: isoDatetime.optional(),
  to: isoDatetime.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export type AdminEventsQuery = z.infer<typeof AdminEventsQuerySchema>;

/* ------------------------------------------------------------------ */
/*  Bulk action schema                                                  */
/* ------------------------------------------------------------------ */

export const BulkActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export type BulkAction = z.infer<typeof BulkActionSchema>;

/* ------------------------------------------------------------------ */
/*  Response types                                                      */
/* ------------------------------------------------------------------ */

export interface PublicEventItem {
  id: string;
  title: string;
  startsAt: string; // ISO-8601 UTC
  endsAt: string | null;
  tzid: string;
  allDay: boolean;
  venueName: string | null;
  region: string;
  category: string;
  tags: string[];
  url: string;
  sourceName: string | null;
  imageUrl: string | null;
}

export interface PublicEventsPage {
  events: PublicEventItem[];
  nextCursor: string | null;
}

export interface PublicEventDetail extends PublicEventItem {
  description: string | null;
  descriptionHtml: string | null;
  venueAddress: string | null;
  lat: string | null;
  lng: string | null;
  externalUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
}

/* ------------------------------------------------------------------ */
/*  Admin event item (includes moderation-specific fields)              */
/* ------------------------------------------------------------------ */

export interface AdminEventItem {
  id: string;
  title: string;
  startsAt: string; // ISO-8601 UTC
  endsAt: string | null;
  region: string;
  category: string;
  status: string;
  sourceName: string | null;
  submitterEmail: string | null;
  dedupCandidatesCount: number;
  createdAt: string;
}

export interface AdminEventsPage {
  events: AdminEventItem[];
  nextCursor: string | null;
}
