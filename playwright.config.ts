import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// Load test-specific env vars (Clerk test keys, base URL overrides, etc.)
// from .env.test.local if it exists — no dotenv dependency required.
const envTestLocal = path.resolve(__dirname, '.env.test.local');
if (fs.existsSync(envTestLocal)) {
  const lines = fs.readFileSync(envTestLocal, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
