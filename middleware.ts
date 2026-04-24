import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|feed.ics|feed.rss|api/cron/.*|api/public/.*|api/submissions).*)',
  ],
};
