import Link from 'next/link';

import SourceForm from '@/components/admin/SourceForm';
import { getAdapterKeysByType } from '@/lib/adapters/index';

export default function NewSourcePage() {
  const adapterKeys = getAdapterKeysByType();

  return (
    <main>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/sources"
          className="text-sm text-vermont-forest underline-offset-2 hover:underline"
        >
          &larr; Back to Sources
        </Link>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-vermont-forest">
        Add Source
      </h1>
      <div className="mt-6">
        <SourceForm adapterKeys={adapterKeys} mode="create" />
      </div>
    </main>
  );
}
