import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neondatabase/serverless', 'drizzle-orm', 'node-ical', 'ws'],
};

export default nextConfig;
