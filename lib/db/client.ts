import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';

// neon-serverless uses WebSockets, which Node 24 has built-in but we set
// the constructor explicitly so behavior is identical across runtimes
// and so the package doesn't fall back to a flaky native lookup.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });
