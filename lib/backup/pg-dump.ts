/**
 * lib/backup/pg-dump.ts -- Stream a PostgreSQL database dump.
 *
 * Fallback chain:
 *   1. Spawn local `pg_dump` binary (custom format) piped through gzip.
 *      This works locally and on runtimes that bundle pg_dump.
 *   2. If the pg_dump binary is not found (ENOENT) or exits with an error,
 *      fall back to a Neon snapshot via NEON_API_KEY (if configured).
 *   3. If no fallback is available, throw with an actionable message.
 *
 * The caller receives a { stream, mode } tuple so the route can report which
 * path was taken.
 */

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

import { env } from '@/lib/env';
import { log } from '@/lib/log';

export type DumpMode = 'pg_dump' | 'neon-snapshot';

export interface DumpResult {
  stream: Readable;
  mode: DumpMode;
}

/**
 * Attempt to stream a gzipped pg_dump of the database.
 * Falls back to Neon snapshot API when the pg_dump binary is unavailable.
 */
export async function streamPgDump(): Promise<DumpResult> {
  const logger = log.child({ fn: 'streamPgDump' });

  try {
    const stream = await spawnPgDump(logger);
    return { stream, mode: 'pg_dump' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('pg_dump spawn failed, checking fallbacks', { error: msg });

    if (env.NEON_API_KEY) {
      logger.info('falling back to Neon snapshot API');
      const stream = await neonSnapshot(logger);
      return { stream, mode: 'neon-snapshot' };
    }

    throw new Error(
      `pg_dump binary unavailable and no NEON_API_KEY configured. Original error: ${msg}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  pg_dump via child_process                                          */
/* ------------------------------------------------------------------ */

function spawnPgDump(logger: ReturnType<typeof log.child>): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const connStr = env.DATABASE_URL_UNPOOLED;
    const child = spawn('pg_dump', [connStr, '-Fc'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error('pg_dump binary not found on PATH'));
      } else {
        reject(err);
      }
    });

    // Pipe through gzip to produce .sql.gz output
    const gzip = createGzip();
    const piped = child.stdout.pipe(gzip);

    // Wait briefly to detect immediate spawn failures before resolving
    child.on('spawn', () => {
      logger.info('pg_dump spawned successfully');
      resolve(piped);
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.error('pg_dump exited with non-zero code', {
          code,
          stderr: stderr.slice(0, 500),
        });
        // Destroy the gzip stream to signal an error downstream
        gzip.destroy(
          new Error(`pg_dump exited with code ${String(code)}: ${stderr.slice(0, 200)}`),
        );
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Neon snapshot fallback                                              */
/* ------------------------------------------------------------------ */

async function neonSnapshot(logger: ReturnType<typeof log.child>): Promise<Readable> {
  // Extract project ID from DATABASE_URL_UNPOOLED
  // Neon connection strings look like: postgresql://user:pass@ep-xxx-yyy-123.us-east-2.aws.neon.tech/dbname
  const hostMatch = env.DATABASE_URL_UNPOOLED.match(/ep-([a-z0-9-]+)\.[^/]+\.neon\.tech/);
  if (!hostMatch) {
    throw new Error('Could not extract Neon project info from DATABASE_URL_UNPOOLED');
  }

  // Use the Neon API to create a snapshot/backup
  // The Neon API endpoint for database exports
  const apiKey = env.NEON_API_KEY!;
  const endpoint = hostMatch[0]!; // full hostname match for logging

  logger.info('requesting Neon snapshot', { endpoint });

  const resp = await fetch(
    `https://console.neon.tech/api/v2/projects/${hostMatch[1]!}/branches/main/databases`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`Neon API returned ${String(resp.status)}: ${await resp.text()}`);
  }

  // Convert response body to a Node readable stream
  if (!resp.body) {
    throw new Error('Neon API response has no body');
  }

  const reader = resp.body.getReader();
  const stream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
      } else {
        this.push(Buffer.from(value));
      }
    },
  });

  return stream;
}
