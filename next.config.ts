import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

/** Repo root (where package.json / node_modules/next live). Turbopack can mis-infer `./app` as root. */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  serverExternalPackages: ['@neondatabase/serverless', 'drizzle-orm', 'node-ical', 'ws'],
};

export default nextConfig;
