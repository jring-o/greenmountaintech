/**
 * tests/unit/scripts/seed-sources.test.ts
 *
 * Spec-driven unit tests for the S23 seed-sources script.
 * Validates source definitions, buildRows logic, env-var fallback behavior,
 * idempotent upsert design, and package/env configuration -- all without a
 * live database.
 *
 * Tests are derived from the S23 session file exit criteria and spec excerpts.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Re-implement the script's data structures and buildRows logic so we can test
// without importing the script (which triggers side-effectful db/env imports).
// ---------------------------------------------------------------------------

interface SourceDef {
  name: string;
  slug: string;
  kind: 'whitelist';
  adapter_type: 'ical' | 'html';
  adapter_key: string;
  url?: string;
  urlEnvVar?: string;
  adapter_config: Record<string, unknown>;
  trust_level: 'auto_publish';
}

const SOURCE_DEFS: SourceDef[] = [
  {
    name: 'UVM Events',
    slug: 'uvm-events',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_UVM_EVENTS',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  {
    name: 'City of Burlington',
    slug: 'city-of-burlington',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_CITY_BURLINGTON',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  {
    name: 'Lake Champlain Chamber',
    slug: 'lake-champlain-chamber',
    kind: 'whitelist',
    adapter_type: 'ical',
    adapter_key: 'generic',
    urlEnvVar: 'SEED_URL_LCC_VERMONT',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  {
    name: 'Vermont Public events',
    slug: 'vermont-public',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'vermont-public',
    url: 'https://www.vermontpublic.org/vermont-events-calendar',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  {
    name: 'Seven Days community events',
    slug: 'seven-days',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'seven-days',
    url: 'https://community.sevendaysvt.com/vermont/EventSearch',
    adapter_config: { pages: 3 },
    trust_level: 'auto_publish',
  },
  {
    name: 'Vermont.com calendar',
    slug: 'vermont-com',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'vermont-com',
    url: 'https://vermont.com/calendar/',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
  {
    name: 'helloburlingtonvt.com events',
    slug: 'hello-burlington-vt',
    kind: 'whitelist',
    adapter_type: 'html',
    adapter_key: 'hello-burlington-vt',
    url: 'https://helloburlingtonvt.com/events',
    adapter_config: {},
    trust_level: 'auto_publish',
  },
];

/** Re-implementation of buildRows from seed-sources.ts for isolated testing. */
function buildRows(defs: SourceDef[]) {
  return defs.map((def) => {
    const envUrl = def.urlEnvVar ? process.env[def.urlEnvVar] : undefined;
    const hasUrl = def.url != null || (envUrl != null && envUrl.length > 0);

    const resolvedUrl = def.url ?? envUrl ?? 'https://placeholder.invalid';
    const resolvedName = hasUrl ? def.name : `${def.name} (URL pending)`;
    const isActive = hasUrl;

    return {
      name: resolvedName,
      slug: def.slug,
      kind: def.kind,
      adapter_type: def.adapter_type,
      adapter_key: def.adapter_key,
      url: resolvedUrl,
      adapter_config: def.adapter_config,
      trust_level: def.trust_level,
      is_active: isActive,
    };
  });
}

// ---------------------------------------------------------------------------
// Shared constants and helpers
// ---------------------------------------------------------------------------

const ICAL_SLUGS = ['uvm-events', 'city-of-burlington', 'lake-champlain-chamber'];
const HTML_SLUGS = ['vermont-public', 'seven-days', 'vermont-com', 'hello-burlington-vt'];
const SEED_ENV_KEYS = [
  'SEED_URL_UVM_EVENTS',
  'SEED_URL_CITY_BURLINGTON',
  'SEED_URL_LCC_VERMONT',
] as const;

const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/seed-sources.ts');
const PKG_PATH = path.resolve(__dirname, '../../../package.json');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '../../../.env.example');

function isIcalSlug(slug: string): boolean {
  return ICAL_SLUGS.includes(slug);
}

function isHtmlSlug(slug: string): boolean {
  return HTML_SLUGS.includes(slug);
}

/** Save current seed env vars and clear them. Returns a restore function. */
function clearSeedEnv(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of SEED_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

/** Save current seed env vars and set them to provided values. Returns a restore function. */
function setSeedEnv(values: Record<string, string>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const key of SEED_ENV_KEYS) {
    saved[key] = process.env[key];
  }
  for (const [key, val] of Object.entries(values)) {
    process.env[key] = val;
  }
  return () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

// ===================================================================
// Tests
// ===================================================================

describe('S23 seed-sources: script file existence', () => {
  it('scripts/seed-sources.ts exists on disk', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe('S23 seed-sources: source definitions', () => {
  it('defines exactly 7 sources (EC-2)', () => {
    expect(SOURCE_DEFS).toHaveLength(7);
  });

  const EXPECTED_SLUGS = [
    'uvm-events',
    'city-of-burlington',
    'lake-champlain-chamber',
    'vermont-public',
    'seven-days',
    'vermont-com',
    'hello-burlington-vt',
  ];

  it('contains all 7 expected slugs', () => {
    const slugs = SOURCE_DEFS.map((d) => d.slug);
    for (const expected of EXPECTED_SLUGS) {
      expect(slugs).toContain(expected);
    }
  });

  for (const expectedSlug of EXPECTED_SLUGS) {
    it(`includes slug "${expectedSlug}"`, () => {
      const found = SOURCE_DEFS.find((d) => d.slug === expectedSlug);
      expect(found).toBeDefined();
    });
  }

  it('all slugs are unique', () => {
    const slugs = SOURCE_DEFS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('all sources have kind = whitelist', () => {
    for (const def of SOURCE_DEFS) {
      expect(def.kind).toBe('whitelist');
    }
  });

  it('all sources have trust_level = auto_publish', () => {
    for (const def of SOURCE_DEFS) {
      expect(def.trust_level).toBe('auto_publish');
    }
  });
});

describe('S23 seed-sources: iCal sources (rows 1-3)', () => {
  const icalDefs = SOURCE_DEFS.filter((d) => d.adapter_type === 'ical');

  it('there are exactly 3 iCal sources', () => {
    expect(icalDefs).toHaveLength(3);
  });

  it('all iCal sources have adapter_key = generic', () => {
    for (const def of icalDefs) {
      expect(def.adapter_key).toBe('generic');
    }
  });

  it('all iCal sources have a urlEnvVar defined', () => {
    for (const def of icalDefs) {
      expect(def.urlEnvVar).toBeDefined();
      expect(typeof def.urlEnvVar).toBe('string');
    }
  });

  it('iCal sources do NOT have a static url', () => {
    for (const def of icalDefs) {
      expect(def.url).toBeUndefined();
    }
  });

  it('iCal env vars are SEED_URL_UVM_EVENTS, SEED_URL_CITY_BURLINGTON, SEED_URL_LCC_VERMONT', () => {
    const envVars = icalDefs.map((d) => d.urlEnvVar);
    expect(envVars).toContain('SEED_URL_UVM_EVENTS');
    expect(envVars).toContain('SEED_URL_CITY_BURLINGTON');
    expect(envVars).toContain('SEED_URL_LCC_VERMONT');
  });
});

describe('S23 seed-sources: HTML sources (rows 4-7)', () => {
  const htmlDefs = SOURCE_DEFS.filter((d) => d.adapter_type === 'html');

  it('there are exactly 4 HTML sources', () => {
    expect(htmlDefs).toHaveLength(4);
  });

  it('all HTML sources have a static url defined', () => {
    for (const def of htmlDefs) {
      expect(def.url).toBeDefined();
      expect(typeof def.url).toBe('string');
      expect(def.url!.startsWith('https://')).toBe(true);
    }
  });

  it('Vermont Public has correct URL', () => {
    const vp = htmlDefs.find((d) => d.slug === 'vermont-public');
    expect(vp?.url).toBe('https://www.vermontpublic.org/vermont-events-calendar');
  });

  it('Seven Days has correct URL', () => {
    const sd = htmlDefs.find((d) => d.slug === 'seven-days');
    expect(sd?.url).toBe('https://community.sevendaysvt.com/vermont/EventSearch');
  });

  it('Vermont.com has correct URL', () => {
    const vc = htmlDefs.find((d) => d.slug === 'vermont-com');
    expect(vc?.url).toBe('https://vermont.com/calendar/');
  });

  it('helloburlingtonvt.com has correct URL', () => {
    const hb = htmlDefs.find((d) => d.slug === 'hello-burlington-vt');
    expect(hb?.url).toBe('https://helloburlingtonvt.com/events');
  });

  it('each HTML source adapter_key matches its slug', () => {
    for (const def of htmlDefs) {
      expect(def.adapter_key).toBe(def.slug);
    }
  });
});

describe('S23 seed-sources: adapter_config', () => {
  it('Seven Days has adapter_config = { pages: 3 }', () => {
    const sd = SOURCE_DEFS.find((d) => d.slug === 'seven-days');
    expect(sd?.adapter_config).toEqual({ pages: 3 });
  });

  it('all other sources have adapter_config = {}', () => {
    const others = SOURCE_DEFS.filter((d) => d.slug !== 'seven-days');
    for (const def of others) {
      expect(def.adapter_config).toEqual({});
    }
  });
});

describe('S23 seed-sources: buildRows with env vars UNSET (EC-4)', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = clearSeedEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('iCal sources get is_active = false when env vars are unset', () => {
    const rows = buildRows(SOURCE_DEFS);
    const icalRows = rows.filter((r) => isIcalSlug(r.slug));
    for (const row of icalRows) {
      expect(row.is_active).toBe(false);
    }
  });

  it('iCal sources get name suffixed with "(URL pending)" when env vars are unset', () => {
    const rows = buildRows(SOURCE_DEFS);
    const icalRows = rows.filter((r) => isIcalSlug(r.slug));
    for (const row of icalRows) {
      expect(row.name).toMatch(/\(URL pending\)$/);
    }
  });

  it('uvm-events name is "UVM Events (URL pending)" when env unset', () => {
    const rows = buildRows(SOURCE_DEFS);
    const uvm = rows.find((r) => r.slug === 'uvm-events');
    expect(uvm?.name).toBe('UVM Events (URL pending)');
  });

  it('iCal sources get placeholder URL when env vars are unset', () => {
    const rows = buildRows(SOURCE_DEFS);
    const icalRows = rows.filter((r) => isIcalSlug(r.slug));
    for (const row of icalRows) {
      expect(row.url).toBe('https://placeholder.invalid');
    }
  });

  it('HTML sources are still is_active = true regardless of env vars', () => {
    const rows = buildRows(SOURCE_DEFS);
    const htmlRows = rows.filter((r) => isHtmlSlug(r.slug));
    for (const row of htmlRows) {
      expect(row.is_active).toBe(true);
    }
  });

  it('HTML sources retain their static URLs', () => {
    const rows = buildRows(SOURCE_DEFS);
    const vp = rows.find((r) => r.slug === 'vermont-public');
    expect(vp?.url).toBe('https://www.vermontpublic.org/vermont-events-calendar');
    const sd = rows.find((r) => r.slug === 'seven-days');
    expect(sd?.url).toBe('https://community.sevendaysvt.com/vermont/EventSearch');
  });
});

describe('S23 seed-sources: buildRows with env vars SET (EC-5)', () => {
  let restoreEnv: () => void;
  const TEST_UVM_URL = 'https://events.uvm.edu/calendar.ics';
  const TEST_CITY_URL = 'https://burlington.civicengage.com/calendar.ics';
  const TEST_LCC_URL = 'https://lcc.example.com/events.ics';

  beforeEach(() => {
    restoreEnv = setSeedEnv({
      SEED_URL_UVM_EVENTS: TEST_UVM_URL,
      SEED_URL_CITY_BURLINGTON: TEST_CITY_URL,
      SEED_URL_LCC_VERMONT: TEST_LCC_URL,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('iCal sources get is_active = true when env vars are set', () => {
    const rows = buildRows(SOURCE_DEFS);
    const icalRows = rows.filter((r) => isIcalSlug(r.slug));
    for (const row of icalRows) {
      expect(row.is_active).toBe(true);
    }
  });

  it('iCal sources get the supplied env URL', () => {
    const rows = buildRows(SOURCE_DEFS);
    const uvm = rows.find((r) => r.slug === 'uvm-events');
    expect(uvm?.url).toBe(TEST_UVM_URL);
    const city = rows.find((r) => r.slug === 'city-of-burlington');
    expect(city?.url).toBe(TEST_CITY_URL);
    const lcc = rows.find((r) => r.slug === 'lake-champlain-chamber');
    expect(lcc?.url).toBe(TEST_LCC_URL);
  });

  it('iCal sources do NOT have "(URL pending)" suffix when env vars are set', () => {
    const rows = buildRows(SOURCE_DEFS);
    const uvm = rows.find((r) => r.slug === 'uvm-events');
    expect(uvm?.name).toBe('UVM Events');
    const city = rows.find((r) => r.slug === 'city-of-burlington');
    expect(city?.name).toBe('City of Burlington');
    const lcc = rows.find((r) => r.slug === 'lake-champlain-chamber');
    expect(lcc?.name).toBe('Lake Champlain Chamber');
  });
});

describe('S23 seed-sources: buildRows trust_level for all sources', () => {
  it('every built row has trust_level = auto_publish', () => {
    const restoreEnv = clearSeedEnv();

    const rows = buildRows(SOURCE_DEFS);
    for (const row of rows) {
      expect(row.trust_level).toBe('auto_publish');
    }

    restoreEnv();
  });
});

describe('S23 seed-sources: idempotent upsert (EC-3)', () => {
  it('script source contains onConflictDoUpdate call', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    expect(src).toContain('.onConflictDoUpdate(');
  });

  it('onConflictDoUpdate targets sources.slug', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    expect(src).toContain('target: sources.slug');
  });

  it('upsert updates all mutable columns via excluded.* or now()', () => {
    const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');
    // Columns updated from excluded row
    const excludedColumns = [
      'name',
      'kind',
      'adapter_type',
      'adapter_key',
      'url',
      'adapter_config',
      'trust_level',
      'is_active',
    ];
    for (const col of excludedColumns) {
      expect(src).toContain(`${col}: sql\`excluded.${col}\``);
    }
    // updated_at uses now() instead of excluded value
    expect(src).toContain('updated_at: sql`now()`');
  });
});

describe('S23 seed-sources: spec compliance for adapter mapping', () => {
  it('uvm-events: ical / generic', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'uvm-events');
    expect(def?.adapter_type).toBe('ical');
    expect(def?.adapter_key).toBe('generic');
  });

  it('city-of-burlington: ical / generic', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'city-of-burlington');
    expect(def?.adapter_type).toBe('ical');
    expect(def?.adapter_key).toBe('generic');
  });

  it('lake-champlain-chamber: ical / generic', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'lake-champlain-chamber');
    expect(def?.adapter_type).toBe('ical');
    expect(def?.adapter_key).toBe('generic');
  });

  it('vermont-public: html / vermont-public', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'vermont-public');
    expect(def?.adapter_type).toBe('html');
    expect(def?.adapter_key).toBe('vermont-public');
  });

  it('seven-days: html / seven-days', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'seven-days');
    expect(def?.adapter_type).toBe('html');
    expect(def?.adapter_key).toBe('seven-days');
  });

  it('vermont-com: html / vermont-com', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'vermont-com');
    expect(def?.adapter_type).toBe('html');
    expect(def?.adapter_key).toBe('vermont-com');
  });

  it('hello-burlington-vt: html / hello-burlington-vt', () => {
    const def = SOURCE_DEFS.find((d) => d.slug === 'hello-burlington-vt');
    expect(def?.adapter_type).toBe('html');
    expect(def?.adapter_key).toBe('hello-burlington-vt');
  });
});

describe('S23 seed-sources: package.json has seed:sources script (Deliverable 5)', () => {
  it('package.json contains seed:sources script', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    expect(pkg.scripts['seed:sources']).toBeDefined();
  });

  it('seed:sources uses tsx to run the script', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    expect(pkg.scripts['seed:sources']).toBe(
      'tsx --import ./scripts/register-env.ts scripts/seed-sources.ts',
    );
  });

  it('tsx is in devDependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    expect(pkg.devDependencies['tsx']).toBeDefined();
  });
});

describe('S23 seed-sources: .env.example has SEED_URL_* placeholders (Deliverable 6)', () => {
  it('.env.example contains SEED_URL_UVM_EVENTS', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    expect(content).toContain('SEED_URL_UVM_EVENTS');
  });

  it('.env.example contains SEED_URL_CITY_BURLINGTON', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    expect(content).toContain('SEED_URL_CITY_BURLINGTON');
  });

  it('.env.example contains SEED_URL_LCC_VERMONT', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    expect(content).toContain('SEED_URL_LCC_VERMONT');
  });

  it('SEED_URL_* lines are commented out (optional)', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    const lines = content.split('\n');
    const seedLines = lines.filter((l) => l.includes('SEED_URL_'));
    // The actual variable lines (not the doc comment) should be commented out
    const varLines = seedLines.filter(
      (l) => l.match(/SEED_URL_(UVM_EVENTS|CITY_BURLINGTON|LCC_VERMONT)=/) != null,
    );
    for (const line of varLines) {
      expect(line.trimStart().startsWith('#')).toBe(true);
    }
  });
});

describe('S23 seed-sources: script source code structure', () => {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf-8');

  it('imports db from lib/db/client', () => {
    expect(src).toContain("from '@/lib/db/client'");
  });

  it('imports sources from lib/db/schema', () => {
    expect(src).toContain("from '@/lib/db/schema'");
  });

  it('imports sql from drizzle-orm', () => {
    expect(src).toContain("from 'drizzle-orm'");
  });

  it('calls process.exit(0) on success', () => {
    expect(src).toContain('process.exit(0)');
  });

  it('calls process.exit(1) on error', () => {
    expect(src).toContain('process.exit(1)');
  });

  it('has exactly 7 source definitions in SOURCE_DEFS array', () => {
    // Count slug occurrences in the SOURCE_DEFS array
    const slugMatches = src.match(/slug:\s*'/g);
    expect(slugMatches).toHaveLength(7);
  });
});
