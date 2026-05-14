import { env } from '@/lib/env';
import { runAll } from '@/lib/ingest/runner';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel Cron invokes scheduled paths with a GET request, sending
// `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is set.
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) return new Response('forbidden', { status: 403 });
  const summaries = await runAll('cron');
  return Response.json({ ok: true, data: summaries });
}
