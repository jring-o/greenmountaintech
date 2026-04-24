import { redirect } from 'next/navigation';

import QueueTable from '@/components/admin/QueueTable';
import { listAdminEvents } from '@/lib/db/queries/events';
import { log } from '@/lib/log';

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const q = typeof resolved.q === 'string' ? resolved.q : undefined;
  const region = typeof resolved.region === 'string' ? resolved.region : undefined;
  const category = typeof resolved.category === 'string' ? resolved.category : undefined;
  const cursor = typeof resolved.cursor === 'string' ? resolved.cursor : undefined;

  let page: Awaited<ReturnType<typeof listAdminEvents>>;

  try {
    page = await listAdminEvents({
      status: 'pending_review',
      ...(q ? { q } : {}),
      ...(region ? { region: region as 'burlington_area' } : {}),
      ...(category ? { category: category as 'music' } : {}),
      ...(cursor ? { cursor } : {}),
      limit: 25,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (cursor && message.startsWith('Invalid cursor')) {
      redirect('/admin/queue');
    }
    log.error('Failed to load queue events', { error: message });
    throw err;
  }

  return (
    <main>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Moderation Queue
      </h1>
      <QueueTable
        events={page.events}
        nextCursor={page.nextCursor}
        currentQ={q}
        currentRegion={region}
        currentCategory={category}
      />
    </main>
  );
}
