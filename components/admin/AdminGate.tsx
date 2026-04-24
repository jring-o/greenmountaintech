import { requireAdmin } from '@/lib/auth/clerk';

/**
 * Async server component that gates admin-only content.
 * Renders children when the current user is an admin;
 * calls notFound() (returns 404) otherwise.
 */
export default async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
