import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { Adapter, AdapterContext, AdapterEvent } from '@/lib/adapters/types';
import { UnknownAdapterError } from '@/lib/adapters/types';
import type { SourceRow } from '@/lib/db/schema';

/* ------------------------------------------------------------------ */
/*  Shared fakes                                                       */
/* ------------------------------------------------------------------ */

function fakeSource(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Stub Source',
    slug: 'stub-source',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'stub',
    url: 'https://example.com/feed',
    adapter_config: {},
    trust_level: 'auto_publish',
    is_active: true,
    contact_url: null,
    rate_limit_per_min: 30,
    robots_respect: false,
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeAdapterEvent(overrides: Partial<AdapterEvent> = {}): AdapterEvent {
  return {
    externalId: `ext-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Vermont Community Supper',
    description: 'A lovely community supper in Vermont',
    startsAtUtc: new Date('2025-08-01T18:00:00Z'),
    endsAtUtc: new Date('2025-08-01T21:00:00Z'),
    tzid: 'America/New_York',
    allDay: false,
    venueName: 'Town Hall',
    url: 'https://example.com/event',
    category: 'community_civic',
    tags: ['community'],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Mutable tracking state                                             */
/* ------------------------------------------------------------------ */

let insertedRuns: Record<string, unknown>[] = [];
let updatedRuns: { set: Record<string, unknown> }[] = [];
let updatedSources: { set: Record<string, unknown> }[] = [];
let queriedSources: SourceRow[] = [];
let runIdCounter = 0;
let stubAdapterImpl: Adapter | null = null;
let persistCallCount = 0;
let persistBehavior: (callIndex: number) => Promise<string> = async () => 'inserted';

/* ------------------------------------------------------------------ */
/*  Mocks (hoisted by vi.mock)                                         */
/* ------------------------------------------------------------------ */

vi.mock('@/lib/env', () => ({
  env: {
    CRON_SECRET: 'test-secret-that-is-at-least-32-chars-long!!',
    INGEST_CONCURRENCY: 4,
    USER_AGENT_CONTACT: 'test@example.com',
  },
}));

vi.mock('@/lib/log', () => {
  const fakeLogger: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => fakeLogger,
  };
  return { log: fakeLogger };
});

vi.mock('@/lib/db/client', () => {
  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => queriedSources,
          limit: () => [],
        }),
        orderBy: () => queriedSources,
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertedRuns.push(vals);
        runIdCounter++;
        return {
          returning: () => [{ id: `run-${runIdCounter}` }],
        };
      },
    }),
    update: () => ({
      set: (setVals: Record<string, unknown>) => ({
        where: () => {
          // Distinguish by presence of items_found or status
          if ('items_found' in setVals || ('status' in setVals && 'duration_ms' in setVals)) {
            updatedRuns.push({ set: setVals });
          } else {
            updatedSources.push({ set: setVals });
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  };
  return { db: mockDb };
});

vi.mock('@/lib/adapters/index', () => ({
  resolveAdapter: (source: SourceRow) => {
    if (stubAdapterImpl) return stubAdapterImpl;
    throw new UnknownAdapterError(source.adapter_type, source.adapter_key);
  },
}));

vi.mock('@/lib/adapters/boot-check', () => ({
  assertAllSourceAdaptersResolvable: vi.fn(() => []),
}));

vi.mock('@/lib/adapters/helpers/fetch', () => ({
  createFetch: () => async () => new Response('ok'),
}));

vi.mock('@/lib/ingest/normalize', () => ({
  normalize: (event: AdapterEvent, source: SourceRow) => ({
    source_id: source.id,
    external_id: event.externalId ?? 'derived-id',
    title: event.title,
    description: event.description ?? null,
    description_html: null,
    starts_at_utc: event.startsAtUtc,
    ends_at_utc: event.endsAtUtc ?? null,
    tzid: event.tzid,
    all_day: event.allDay ?? false,
    venue_name: event.venueName ?? null,
    venue_address: null,
    region: 'statewide',
    lat: null,
    lng: null,
    url: event.url ?? null,
    image_url: null,
    category: event.category ?? 'other',
    tags: event.tags ?? [],
    dedupe_key: `${event.title}|stub-dedupe`,
  }),
}));

vi.mock('@/lib/ingest/persist', () => ({
  persistEvent: async () => {
    const idx = persistCallCount++;
    return persistBehavior(idx);
  },
}));

/* ------------------------------------------------------------------ */
/*  Reset between tests                                                */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  insertedRuns = [];
  updatedRuns = [];
  updatedSources = [];
  queriedSources = [];
  runIdCounter = 0;
  stubAdapterImpl = null;
  persistCallCount = 0;
  persistBehavior = async () => 'inserted';
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('runner — runAll', () => {
  it('returns [] with zero active sources and writes no ingestion_runs', async () => {
    queriedSources = [];

    const { runAll } = await import('@/lib/ingest/runner');
    const summaries = await runAll('cron');

    expect(summaries).toEqual([]);
    expect(insertedRuns).toHaveLength(0);
  });

  it('with one active stub source yielding 3 events: items_found=3, items_new=3, status=ok', async () => {
    const source = fakeSource();
    queriedSources = [source];

    stubAdapterImpl = {
      key: 'test:stub',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *ingest(_ctx: AdapterContext): AsyncIterable<AdapterEvent> {
        yield fakeAdapterEvent({ externalId: 'e1', title: 'Event One' });
        yield fakeAdapterEvent({ externalId: 'e2', title: 'Event Two' });
        yield fakeAdapterEvent({ externalId: 'e3', title: 'Event Three' });
      },
    };

    const { runAll } = await import('@/lib/ingest/runner');
    const summaries = await runAll('cron');

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.itemsFound).toBe(3);
    expect(s.itemsNew).toBe(3);
    expect(s.status).toBe('ok');

    // ingestion_runs row was inserted
    expect(insertedRuns).toHaveLength(1);

    // source updated: last_run_status='ok', consecutive_failures reset to 0
    expect(updatedSources).toHaveLength(1);
    expect(updatedSources[0]!.set.last_run_status).toBe('ok');
    expect(updatedSources[0]!.set.consecutive_failures).toBe(0);
  });

  it('with a stub adapter that throws on the second item: items_errored=1, status=partial, error_log has entry', async () => {
    const source = fakeSource();
    queriedSources = [source];

    stubAdapterImpl = {
      key: 'test:stub',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *ingest(_ctx: AdapterContext): AsyncIterable<AdapterEvent> {
        yield fakeAdapterEvent({ externalId: 'e1', title: 'Event One' });
        yield fakeAdapterEvent({ externalId: 'e2', title: 'Event Two' });
        yield fakeAdapterEvent({ externalId: 'e3', title: 'Event Three' });
      },
    };

    // Second persist call throws
    persistBehavior = async (idx) => {
      if (idx === 1) throw new Error('Simulated item error');
      return 'inserted';
    };

    const { runAll } = await import('@/lib/ingest/runner');
    const summaries = await runAll('cron');

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.itemsErrored).toBe(1);
    expect(s.status).toBe('partial');

    // The ingestion_runs update has error_log with 1 entry
    expect(updatedRuns).toHaveLength(1);
    const runUpdate = updatedRuns[0]!.set;
    const errorLogEntries = runUpdate.error_log as Array<{ message: string }>;
    expect(errorLogEntries).toHaveLength(1);
    expect(errorLogEntries[0]!.message).toContain('Simulated item error');
  });

  it('with an unregistered adapter_key: run status=error, consecutive_failures incremented, error_log has UnknownAdapterError', async () => {
    const source = fakeSource({
      adapter_type: 'html',
      adapter_key: 'nonexistent',
    });
    queriedSources = [source];
    stubAdapterImpl = null; // resolveAdapter will throw

    const { runAll } = await import('@/lib/ingest/runner');
    const summaries = await runAll('cron');

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.status).toBe('error');

    // ingestion_runs updated with error
    expect(updatedRuns).toHaveLength(1);
    expect(updatedRuns[0]!.set.status).toBe('error');
    const errorLogEntries = updatedRuns[0]!.set.error_log as Array<{ message: string }>;
    expect(errorLogEntries.length).toBeGreaterThanOrEqual(1);
    expect(errorLogEntries[0]!.message).toContain('No adapter registered');

    // source updated with error status
    expect(updatedSources).toHaveLength(1);
    expect(updatedSources[0]!.set.last_run_status).toBe('error');
  });

  it('with INGEST_CONCURRENCY=2 and 5 sources, max concurrent never exceeds 2', async () => {
    // This test uses vi.resetModules + vi.doMock for a fresh import with
    // INGEST_CONCURRENCY=2 and a slow adapter that tracks concurrency.
    vi.resetModules();

    const concurrency = { running: 0, maxSeen: 0 };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const slowAdapter: Adapter = {
      key: 'test:slow',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *ingest(_ctx: AdapterContext): AsyncIterable<AdapterEvent> {
        concurrency.running++;
        concurrency.maxSeen = Math.max(concurrency.maxSeen, concurrency.running);
        await delay(50);
        yield fakeAdapterEvent({ externalId: 'e1' });
        concurrency.running--;
      },
    };

    const sources5 = Array.from({ length: 5 }, (_, i) =>
      fakeSource({
        id: `00000000-0000-0000-0000-00000000000${i + 1}`,
        name: `Source ${i + 1}`,
        slug: `source-${i + 1}`,
      }),
    );

    vi.doMock('@/lib/env', () => ({
      env: {
        CRON_SECRET: 'test-secret-that-is-at-least-32-chars-long!!',
        INGEST_CONCURRENCY: 2,
        USER_AGENT_CONTACT: 'test@example.com',
      },
    }));

    vi.doMock('@/lib/log', () => {
      const fl: Record<string, unknown> = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => fl,
      };
      return { log: fl };
    });

    let localRunId = 0;
    vi.doMock('@/lib/db/client', () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: () => sources5 }),
            orderBy: () => sources5,
          }),
        }),
        insert: () => ({
          values: () => {
            localRunId++;
            return { returning: () => [{ id: `run-${localRunId}` }] };
          },
        }),
        update: () => ({
          set: () => ({ where: () => Promise.resolve() }),
        }),
        delete: () => ({
          where: () => Promise.resolve(),
        }),
      },
    }));

    vi.doMock('@/lib/adapters/index', () => ({
      resolveAdapter: () => slowAdapter,
    }));

    vi.doMock('@/lib/adapters/boot-check', () => ({
      assertAllSourceAdaptersResolvable: vi.fn(() => []),
    }));

    vi.doMock('@/lib/adapters/helpers/fetch', () => ({
      createFetch: () => async () => new Response('ok'),
    }));

    vi.doMock('@/lib/ingest/normalize', () => ({
      normalize: (event: AdapterEvent, source: SourceRow) => ({
        source_id: source.id,
        external_id: event.externalId ?? 'derived-id',
        title: event.title,
        description: event.description ?? null,
        description_html: null,
        starts_at_utc: event.startsAtUtc,
        ends_at_utc: event.endsAtUtc ?? null,
        tzid: event.tzid,
        all_day: event.allDay ?? false,
        venue_name: event.venueName ?? null,
        venue_address: null,
        region: 'statewide',
        lat: null,
        lng: null,
        url: event.url ?? null,
        image_url: null,
        category: event.category ?? 'other',
        tags: event.tags ?? [],
        dedupe_key: `${event.title}|stub-dedupe`,
      }),
    }));

    vi.doMock('@/lib/ingest/persist', () => ({
      persistEvent: async () => 'inserted',
    }));

    const { runAll: runAll2 } = await import('@/lib/ingest/runner');
    const summaries = await runAll2('cron');

    expect(summaries).toHaveLength(5);
    expect(concurrency.maxSeen).toBeLessThanOrEqual(2);
    expect(concurrency.maxSeen).toBeGreaterThanOrEqual(1);
  });
});
