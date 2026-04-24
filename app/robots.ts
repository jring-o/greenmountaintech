import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = env.NEXT_PUBLIC_SITE_DOMAIN;

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/events/', '/about', '/submit', '/feed.ics', '/feed.rss'],
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
