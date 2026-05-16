# Eagle Info Repair Manager

Role-based repair job management system built with Next.js App Router, BetterAuth, Prisma, and SQLite.

## Quick Start

1. Install deps:

```bash
bun install
```

2. Configure env:

```bash
cp .env.example .env
```

3. Run migrations + generate:

```bash
bunx prisma migrate dev --name init
bunx prisma generate
```

4. Seed admin user:

```bash
bun run seed
```

5. Start dev server:

```bash
bun run dev
```

## Sample Login


## Useful Checks

- Lint: `bun run lint`
- Production build: `bun run build`
- Static internal link check: `bun run check:links`
- Revenue report from DB: `bun run report:revenue`
- Backfill legacy completed jobs missing final cost: `bun run data:backfill-final-cost`
- Ship gate checks: `bun run predeploy:check`
- CI release gate (requires HTTPS + QA base URL): `bun run predeploy:ci`

## Workspace Notes

- Use `bun.lock` as the project lockfile. Do not add a project-level `package-lock.json`.
- If Next.js warns about `/Users/mac/github/package-lock.json`, that file is outside this workspace. The app pins `turbopack.root` to this repo and `.gitignore` excludes project `package-lock.json` files.
- Keep `.claude/worktrees/` untracked; it is ignored because those directories are parallel-agent scratch worktrees, not active source.

## Document Model Notes

- Invoices, receipts/payments, and delivery notes are persisted records and expose row-level CRUD where business rules allow it.
- Job cards and quotations are generated from the current `Job` record. Their lifecycle is intentionally source-driven: create/open the job, edit the job to update generated output, download the PDF, and delete the job only through guarded job deletion.
- If legal/audit requirements later need immutable quote/job-card revisions, add a persisted document registry instead of overloading the generated PDF routes.

## Revenue Logic

Default display currency is controlled by `APP_CURRENCY`.

- Default: `UGX`
- To switch to USD (or another ISO currency code), set `APP_CURRENCY="USD"`.

Revenue widget on `/reports` calculates:

- jobs where `status = COMPLETED`
- and `clientBill` is set
- and `completedAt` is in current month

If `clientBill` is never filled in job financials, revenue remains `0`.

## Deployment

This project supports local SQLite and Turso (libSQL).

Schema changes are explicit. Build scripts only run `prisma generate` and `next build`; they do not mutate the database. Before relying on new document, POS, audit, commercial, or entitlement tables in an environment, run the approved schema deploy/sync step:

```bash
bun run db:deploy
# or, for local/dev SQLite only:
bun run db:push && bun run prisma:generate
```

### Turso (recommended for production)

Set these environment variables:

- `PROD=true`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `CRON_SECRET` (for protected manual cron triggers)

When `PROD=true`, Prisma uses Turso via the libSQL adapter.

### Scheduled maintenance crons

Configured in `vercel.json`:

- `/api/cron/whatsapp-retry` daily at `07:00` UTC
- `/api/cron/data-heal` daily at `02:30` UTC

`/api/cron/data-heal` repairs placeholder job device values (`Unknown`/`OTHER`) using linked `Device` and `RepairRequest` records and writes audit entries.

Manual trigger examples:

```bash
curl -X POST "https://<your-domain>/api/cron/data-heal?secret=$CRON_SECRET&dry=1"
curl -X POST "https://<your-domain>/api/cron/data-heal?secret=$CRON_SECRET"
```

### Local SQLite / single server

SQLite is best suited for single-server deployment.

### Render (recommended)

This repo includes `render.yaml` with:

- persistent disk mounted at `/var/data`
- SQLite database at `file:/var/data/dev.db`
- uploads at `/var/data/uploads`

Steps:

1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** service from the repo.
3. Set required env vars in Render:
   - `NEXT_PUBLIC_APP_URL` (your app URL)
   - `BETTER_AUTH_URL` (same URL)
   - `BETTER_AUTH_SECRET` (strong random string)
4. Deploy.

After first deploy, open a shell in Render and run:

```bash
bun run seed
```

Then log in with the seeded admin.

### Local container run

```bash
docker compose up --build
```

App: `http://localhost:3000`

### Production notes

- Set a strong `BETTER_AUTH_SECRET`
- Keep `prisma/dev.db` on persistent storage/volume
- Back up SQLite regularly
- If scaling to multiple servers, move to PostgreSQL

<!-- deploy trigger -->
