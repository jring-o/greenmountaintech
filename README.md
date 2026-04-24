# Vermont Events

A community events calendar for Vermont that scrapes public resources and
displays them on a unified calendar. Events flow in through three ingestion
paths:

1. **Whitelisted auto-scrape** -- pre-approved sources scraped on a daily cron.
2. **Admin-added sources** -- the admin adds a new source URL via the admin UI;
   it is scraped on the next cron run.
3. **Public submissions** -- anyone can submit an event through a public form;
   submissions enter a review queue before publishing.

This is a single-admin personal project (no user accounts) deployed on the
Vercel Hobby tier.

## Tech Stack

| Layer       | Technology          |
| ----------- | ------------------- |
| Framework   | Next.js App Router  |
| Language    | TypeScript (strict) |
| Hosting     | Vercel (Hobby tier) |
| Database    | Neon Postgres       |
| ORM         | Drizzle ORM         |
| Auth        | Clerk               |
| Calendar UI | FullCalendar        |
| Styling     | Tailwind CSS        |

## Local Dev Quickstart

```bash
git clone https://github.com/<your-user>/vermont-events.git
cd vermont-events
pnpm install
cp .env.example .env.local   # fill in real values
pnpm db:migrate
pnpm seed:sources
pnpm dev
```

## Required Environment Variables

| Var                                           | Description                                    | Where                          |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `DATABASE_URL`                                | Pooled Neon connection string.                 | Vercel (auto from Marketplace) |
| `DATABASE_URL_UNPOOLED`                       | Direct Neon URL for migrations.                | Vercel (auto)                  |
| `CLERK_PUBLISHABLE_KEY`                       | Clerk publishable key.                         | Vercel (auto from Marketplace) |
| `CLERK_SECRET_KEY`                            | Clerk secret.                                  | Vercel (auto)                  |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`           | Mirror for client.                             | Vercel (auto)                  |
| `ADMIN_EMAILS`                                | Comma-separated lowercase admin emails.        | Manual                         |
| `CRON_SECRET`                                 | Random 32-byte hex; required by `/api/cron/*`. | Manual                         |
| `USER_AGENT_CONTACT`                          | Email to put in scraper UA (`mailto:`).        | Manual                         |
| `SUBMISSION_IP_SALT`                          | Random 32-byte hex; salts IP hashes.           | Manual                         |
| `INGEST_CONCURRENCY`                          | Optional; default 4.                           | Manual                         |
| `DEDUPE_AUTO_THRESHOLD`                       | Optional; default 0.92.                        | Manual                         |
| `DEDUPE_REVIEW_THRESHOLD`                     | Optional; default 0.75.                        | Manual                         |
| `BLOB_READ_WRITE_TOKEN`                       | Optional; for `/api/cron/backup`.              | Vercel (auto if Blob added)    |
| `NEON_API_KEY`                                | Optional; backup fallback.                     | Manual                         |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Optional v1.1.                                 | Manual                         |
| `DEBUG`                                       | Optional; enables debug logs.                  | Manual                         |

## How to Add a New Source

1. **Pick the kind & adapter type.**
   - Has an `.ics`/iCal feed? -> `adapter_type = 'ical'`, `adapter_key = 'generic'`.
   - Has an RSS/Atom feed? -> `adapter_type = 'rss'`, `adapter_key = 'generic'`.
   - Static HTML page? -> `adapter_type = 'html'`, write a per-source TS file.
   - JSON API? -> `adapter_type = 'json'`, write a per-source TS file.
2. **For HTML/JSON: drop a file at `lib/adapters/<type>/<slug>.ts`** that exports a default `Adapter` (see spec section 8.1). Add it to the registry in `lib/adapters/index.ts`. Capture a fixture under `tests/fixtures/<slug>/` and write a Vitest test asserting parse output.
3. **Add the source row** via the admin UI (`/admin/sources/new`) or via `scripts/seed-sources.ts` for whitelist seeding. Choose `trust_level` deliberately -- `auto_publish` only for sources you have audited.
4. **Deploy** (push to `main`; Vercel auto-deploys; migrations run if any).
5. **Verify** with the admin "Run now" button on the source detail page; inspect the resulting `/admin/runs/[id]` for counts and errors.

## Operating the Cron

The daily ingestion cron runs via Vercel Cron and hits `/api/cron/ingest`.

### Manually Trigger a Run

```bash
curl -X POST https://<your-domain>/api/cron/ingest \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Where to Inspect Runs

Navigate to **Admin > Runs** (`/admin/runs`) to see a list of all ingestion
runs with timestamps, event counts, and error summaries.

## Restoring from Backup

Backups are created by the `/api/cron/backup` endpoint and stored in Vercel
Blob as `pg_dump` SQL files.

### Primary Method: pg_dump Restore

1. Download the latest backup from the Vercel Blob dashboard (or via the
   `@vercel/blob` API).
2. Create a fresh Neon branch for the restore target.
3. Restore:

```bash
psql "$DATABASE_URL_UNPOOLED" < dump.sql
```

### Fallback: Neon Snapshot

If `pg_dump` backups are unavailable, use a Neon-snapshot as a fallback:

1. Open the Neon console and navigate to your project.
2. Create a new branch from the desired point-in-time snapshot.
3. Update `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel env vars to
   point to the new branch, then redeploy.

## Lockout Recovery

If you lose access to the admin account:

1. Rotate your credentials via the **Clerk dashboard**.
2. Swap the `ADMIN_EMAILS` value in Vercel environment variables to match the
   new email.
3. Redeploy the application.

## Vercel Hobby Tier Constraints

- **Cron frequency**: Hobby tier supports daily cron only (no hourly or
  per-minute schedules).
- **Function timeout**: 300 seconds maximum with Fluid Compute enabled. Long
  ingestion runs must complete within this window; use `INGEST_CONCURRENCY` to
  tune parallelism.

## Seeding Fixture Data

After running migrations (`pnpm db:migrate`), seed the database with sample events:

```bash
pnpm seed:fixtures
```

This inserts 15 hand-crafted published events covering every region and category
so the public calendar has data to render during development. The script is
idempotent -- re-running it will not create duplicates.
