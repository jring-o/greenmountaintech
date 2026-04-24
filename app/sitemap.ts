import { and, eq, isNull } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';
import { env } from '@/lib/env';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = env.NEXT_PUBLIC_SITE_DOMAIN;

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/submit` },
  ];

  // All published event detail pages
  const publishedEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.status, 'published'), isNull(events.merged_into)));

  const eventPages: MetadataRoute.Sitemap = publishedEvents.map((row) => ({
    url: `${siteUrl}/events/${row.id}`,
  }));

  return [...staticPages, ...eventPages];
}
