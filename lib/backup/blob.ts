/**
 * lib/backup/blob.ts -- Upload backups to Vercel Blob and prune old ones.
 */

import type { Readable } from 'node:stream';

import { del, list, put } from '@vercel/blob';

import { log } from '@/lib/log';

/**
 * Build a timestamped backup filename, e.g. `backups/vermont-events-20260420-0400.sql.gz`.
 */
export function backupFilename(now = new Date()): string {
  const ts = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '-',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
  ].join('');
  return `backups/vermont-events-${ts}.sql.gz`;
}

export interface UploadResult {
  url: string;
  sizeBytes: number;
  pathname: string;
}

/**
 * Upload a gzipped database dump to Vercel Blob.
 *
 * @param stream  - Readable stream of the gzipped dump
 * @param filename - Blob pathname, e.g. `backups/vermont-events-20260420-0400.sql.gz`
 */
export async function uploadBackup(stream: Readable, filename: string): Promise<UploadResult> {
  const logger = log.child({ fn: 'uploadBackup', filename });
  logger.info('uploading backup to Vercel Blob');

  const blob = await put(filename, stream, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/gzip',
  });

  logger.info('backup uploaded', { url: blob.url, pathname: blob.pathname });

  // Fetch size via a HEAD-style check; the put result doesn't include size
  // directly, so we list by the exact pathname to get it.
  const listed = await list({ prefix: blob.pathname, limit: 1 });
  const sizeBytes = listed.blobs[0]?.size ?? 0;

  return {
    url: blob.url,
    sizeBytes,
    pathname: blob.pathname,
  };
}

/**
 * Keep the `keep` most recent backups under `prefix` and delete the rest.
 * Returns the number of deleted blobs.
 */
export async function pruneOldBackups(prefix = 'backups/', keep = 8): Promise<number> {
  const logger = log.child({ fn: 'pruneOldBackups', prefix, keep });

  // Collect all blobs under the prefix (paginated)
  const allBlobs: { url: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;

  do {
    const opts = cursor ? { prefix, cursor, limit: 1000 } : { prefix, limit: 1000 };
    const page = await list(opts);
    for (const b of page.blobs) {
      allBlobs.push({ url: b.url, uploadedAt: b.uploadedAt });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (allBlobs.length <= keep) {
    logger.info('no backups to prune', { total: allBlobs.length, keep });
    return 0;
  }

  // Sort newest-first by uploadedAt
  allBlobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  const toDelete = allBlobs.slice(keep);
  const urls = toDelete.map((b) => b.url);

  logger.info('pruning old backups', {
    total: allBlobs.length,
    keeping: keep,
    deleting: toDelete.length,
  });

  await del(urls);

  logger.info('pruned old backups', { deleted: toDelete.length });
  return toDelete.length;
}
