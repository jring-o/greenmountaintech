import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

export default async function TopBar() {
  let email = 'Admin';
  try {
    const { sessionClaims } = await auth();
    if (typeof sessionClaims?.email === 'string') {
      email = sessionClaims.email;
    }
  } catch {
    // auth() can fail if Clerk is misconfigured or unreachable; fall back to default
  }

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-vermont-forest/10 bg-vermont-forest px-4 py-3 text-sm text-vermont-cream sm:px-6 lg:px-8">
      <span className="font-display font-bold tracking-tight">Vermont Events Admin</span>
      <div className="flex items-center gap-4">
        <span className="hidden sm:inline">{email}</span>
        <SignOutButton>
          <button
            type="button"
            className="rounded-md border border-vermont-cream/30 px-3 py-1 text-xs font-medium transition-colors hover:bg-vermont-cream/10"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
