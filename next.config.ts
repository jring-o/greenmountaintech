import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@neondatabase/serverless', 'drizzle-orm', 'node-ical'],
};

export default nextConfig;
