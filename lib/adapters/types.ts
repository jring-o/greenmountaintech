import type { z } from 'zod';

import type { SourceRow } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Region & EventCategory – derived from the Drizzle pgEnum values   */
/* ------------------------------------------------------------------ */

export type Region =
  | 'burlington_area'
  | 'champlain_valley'
  | 'central_vt'
  | 'northeast_kingdom'
  | 'southern_vt'
  | 'statewide';

export type EventCategory =
  | 'music'
  | 'arts_theater'
  | 'food_drink'
  | 'community_civic'
  | 'outdoors_recreation'
  | 'family_kids'
  | 'education_lecture'
  | 'film'
  | 'sports'
  | 'farmers_market'
  | 'fundraiser'
  | 'other';

/* ------------------------------------------------------------------ */
/*  Logger – mirrors the interface from lib/log.ts                    */
/* ------------------------------------------------------------------ */

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

/* ------------------------------------------------------------------ */
/*  FetchFn – the signature returned by createFetch()                 */
/* ------------------------------------------------------------------ */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/* ------------------------------------------------------------------ */
/*  AdapterEvent – the normalised shape every adapter must yield      */
/* ------------------------------------------------------------------ */

export type AdapterEvent = {
  externalId: string | null;
  title: string;
  description?: string | undefined;
  descriptionHtml?: string | undefined;
  startsAtUtc: Date;
  endsAtUtc?: Date | undefined;
  tzid: string;
  allDay?: boolean | undefined;
  venueName?: string | undefined;
  venueAddress?: string | undefined;
  region?: Region | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  url?: string | undefined;
  imageUrl?: string | undefined;
  category?: EventCategory | undefined;
  tags?: string[] | undefined;
};

/* ------------------------------------------------------------------ */
/*  AdapterContext – injected into every adapter.ingest() call        */
/* ------------------------------------------------------------------ */

export type AdapterContext = {
  source: SourceRow;
  log: Logger;
  fetch: FetchFn;
  now: () => Date;
};

/* ------------------------------------------------------------------ */
/*  Adapter – the contract every adapter module must satisfy           */
/* ------------------------------------------------------------------ */

export interface Adapter {
  /** Stable identifier matching `sources.adapter_key`. */
  readonly key: string;
  /** Fetches and parses; yields normalized events. */
  ingest(ctx: AdapterContext): AsyncIterable<AdapterEvent>;
  /** Optional zod schema describing the shape of `adapter_config`. */
  readonly configSchema?: z.ZodTypeAny | undefined;
}

/* ------------------------------------------------------------------ */
/*  Error classes                                                      */
/* ------------------------------------------------------------------ */

export class UnknownAdapterError extends Error {
  readonly adapterType: string;
  readonly adapterKey: string;

  constructor(adapterType: string, adapterKey: string) {
    super(
      `No adapter registered for "${adapterType}:${adapterKey}". ` +
        `Check the source's adapter_type and adapter_key columns.`,
    );
    this.name = 'UnknownAdapterError';
    this.adapterType = adapterType;
    this.adapterKey = adapterKey;
  }
}

export class RobotsDisallowedError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`robots.txt disallows fetching: ${url}`);
    this.name = 'RobotsDisallowedError';
    this.url = url;
  }
}
