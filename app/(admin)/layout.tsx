import AdminGate from '@/components/admin/AdminGate';
import TopBar from '@/components/admin/TopBar';

/** Prevent static rendering — AdminGate requires auth() at request time. */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </div>
    </AdminGate>
  );
}
