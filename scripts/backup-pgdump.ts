#!/usr/bin/env tsx
/**
 * scripts/backup-pgdump.ts -- Local backup script.
 *
 * Usage:
 *   pnpm tsx scripts/backup-pgdump.ts
 *
 * Runs the same pg_dump + Vercel Blob upload pipeline as the cron route,
 * but can be executed from a local machine for ad-hoc backups.
 *
 * Requires:
 *   - DATABASE_URL_UNPOOLED in .env
 *   - BLOB_READ_WRITE_TOKEN in .env
 *   - pg_dump on PATH
 */

import { backupFilename, uploadBackup, pruneOldBackups } from '@/lib/backup/blob';
import { streamPgDump } from '@/lib/backup/pg-dump';

async function main(): Promise<void> {
  const start = Date.now();

  console.info('[backup] Starting pg_dump...');
  const { stream, mode } = await streamPgDump();

  const filename = backupFilename();

  console.info(`[backup] Uploading to Vercel Blob as ${filename} (mode: ${mode})...`);
  const { url, sizeBytes } = await uploadBackup(stream, filename);

  console.info('[backup] Pruning old backups (keeping 8)...');
  const deleted = await pruneOldBackups('backups/', 8);

  const durationMs = Date.now() - start;
  console.info('[backup] Done.', { url, sizeBytes, durationMs, mode, deleted });
}

main().catch((err: unknown) => {
  console.error('[backup] Failed:', err);
  process.exitCode = 1;
});
