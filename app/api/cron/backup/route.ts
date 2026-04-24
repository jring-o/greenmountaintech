import { backupFilename, uploadBackup, pruneOldBackups } from '@/lib/backup/blob';
import { streamPgDump } from '@/lib/backup/pg-dump';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 403 });
  }

  const logger = log.child({ route: '/api/cron/backup' });
  const start = Date.now();

  try {
    // 1. Stream pg_dump (with fallback chain)
    const { stream, mode } = await streamPgDump();

    // 2. Build filename with current timestamp
    const filename = backupFilename();

    // 3. Upload to Vercel Blob
    const { url, sizeBytes } = await uploadBackup(stream, filename);

    // 4. Prune old backups (keep 8 most recent)
    await pruneOldBackups('backups/', 8);

    const durationMs = Date.now() - start;

    logger.info('backup completed', { url, sizeBytes, durationMs, mode });

    return Response.json({
      ok: true,
      data: { url, sizeBytes, durationMs, mode },
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('backup failed', { error: msg, durationMs });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
