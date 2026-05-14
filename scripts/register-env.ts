/**
 * Preload with: `tsx --import ./scripts/register-env.ts <script>`
 *
 * Loads `.env.local` into `process.env` before `@/lib/env` runs. Node 20 does not
 * support `--env-file-if-exists`; plain `--env-file` fails when the file is absent.
 *
 * Handles common one-line `KEY=value` / `KEY="value"` entries; does not expand
 * variable references (same limitation as many simple loaders).
 *
 * Duplicate keys in the file: **last assignment wins** (same as dotenv). Values
 * are only applied when `process.env[key]` is still unset (shell / OS wins first).
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  const fromFile: Record<string, string> = {};

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key.startsWith('#')) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    fromFile[key] = val;
  }

  for (const [key, val] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
