import { z } from 'zod';

import {
  adapterTypeEnum,
  eventCategoryEnum,
  eventStatusEnum,
  regionEnum,
  sourceKindEnum,
  trustLevelEnum,
} from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Shared param schemas                                                */
/* ------------------------------------------------------------------ */

/** Validates a single `id` route param as a UUID. */
export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

/* ------------------------------------------------------------------ */
/*  Shared refinements                                                  */
/* ------------------------------------------------------------------ */

const isoDatetime = z.string().refine((s) => !isNaN(new Date(s).getTime()), {
  message: 'Invalid ISO datetime',
});

/* ------------------------------------------------------------------ */
/*  adminSubmissionSchema -- snake_case, lenient defaults.              */
/*  Used by admin / ingest pipelines. For the public submission         */
/*  endpoint (POST /api/submissions) see the canonical camelCase        */
/*  submissionSchema exported from app/api/submissions/route.ts.        */
/* ------------------------------------------------------------------ */

export const adminSubmissionSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(300),
    description: z.string().max(5000).optional(),
    description_html: z.string().max(20000).optional(),
    starts_at_utc: isoDatetime,
    ends_at_utc: isoDatetime.optional(),
    tzid: z.string().default('America/New_York'),
    all_day: z.boolean().default(false),
    venue_name: z.string().max(300).optional(),
    venue_address: z.string().max(500).optional(),
    region: z.enum(regionEnum.enumValues).default('statewide'),
    lat: z.string().optional(),
    lng: z.string().optional(),
    url: z.string().url().max(2000).optional(),
    image_url: z.string().url().max(2000).optional(),
    category: z.enum(eventCategoryEnum.enumValues).default('other'),
    tags: z.array(z.string().max(50)).max(20).default([]),
    submitter_email: z.string().email().optional(),
  })
  .refine(
    (val) => {
      if (val.ends_at_utc) {
        return new Date(val.ends_at_utc) >= new Date(val.starts_at_utc);
      }
      return true;
    },
    {
      message: 'End date must be after start date',
      path: ['ends_at_utc'],
    },
  );

export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;

/* ------------------------------------------------------------------ */
/*  adminEventPatchSchema — partial update with admin-only fields       */
/* ------------------------------------------------------------------ */

export const adminEventPatchSchema = z.object({
  // All submission fields (optional for partial update)
  title: z.string().min(1, 'Title is required').max(300).optional(),
  description: z.string().max(5000).optional(),
  description_html: z.string().max(20000).optional(),
  starts_at_utc: isoDatetime.optional(),
  ends_at_utc: isoDatetime.nullable().optional(),
  tzid: z.string().optional(),
  all_day: z.boolean().optional(),
  venue_name: z.string().max(300).nullable().optional(),
  venue_address: z.string().max(500).nullable().optional(),
  lat: z.string().nullable().optional(),
  lng: z.string().nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  image_url: z.string().url().max(2000).nullable().optional(),

  // Admin-only fields
  status: z.enum(eventStatusEnum.enumValues).optional(),
  category: z.enum(eventCategoryEnum.enumValues).optional(),
  region: z.enum(regionEnum.enumValues).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  merged_into: z.string().uuid().nullable().optional(),
  published_at: isoDatetime.nullable().optional(),
});

export type AdminEventPatch = z.infer<typeof adminEventPatchSchema>;

/* ------------------------------------------------------------------ */
/*  sourceCreateSchema — new source validation                          */
/* ------------------------------------------------------------------ */

export const sourceCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  kind: z.enum(sourceKindEnum.enumValues),
  adapter_type: z.enum(adapterTypeEnum.enumValues),
  adapter_key: z.string().min(1, 'Adapter key is required'),
  url: z.string().url().max(2000),
  adapter_config: z.record(z.string(), z.unknown()).default({}),
  trust_level: z.enum(trustLevelEnum.enumValues).default('review'),
  is_active: z.boolean().default(true),
  contact_url: z.string().url().max(2000).nullable().optional(),
  rate_limit_per_min: z.number().int().min(1).max(600).default(30),
  robots_respect: z.boolean().default(true),
});

export type SourceCreate = z.infer<typeof sourceCreateSchema>;

/* ------------------------------------------------------------------ */
/*  sourcePatchSchema — partial update for source                       */
/* ------------------------------------------------------------------ */

export const sourcePatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  kind: z.enum(sourceKindEnum.enumValues).optional(),
  adapter_type: z.enum(adapterTypeEnum.enumValues).optional(),
  adapter_key: z.string().min(1).optional(),
  url: z.string().url().max(2000).optional(),
  adapter_config: z.record(z.string(), z.unknown()).optional(),
  trust_level: z.enum(trustLevelEnum.enumValues).optional(),
  is_active: z.boolean().optional(),
  contact_url: z.string().url().max(2000).nullable().optional(),
  rate_limit_per_min: z.number().int().min(1).max(600).optional(),
  robots_respect: z.boolean().optional(),
});

export type SourcePatch = z.infer<typeof sourcePatchSchema>;
