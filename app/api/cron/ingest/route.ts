import { env } from '@/lib/env';
import { runAll, runOne } from '@/lib/ingest/runner';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) return new Response('forbidden', { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body?.sourceId) {
    const summary = await runOne(body.sourceId, 'cron');
    return Response.json({ ok: true, data: summary });
  }
  const summaries = await runAll('cron');
  return Response.json({ ok: true, data: summaries });
}
