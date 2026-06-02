# AGENTS.md - Eagle Info Repair Manager Current Runbook

This file is the operating guide for AI agents and developers working in this repo. It describes the current system, the desired production behavior, and the checks to run when troubleshooting reliability, security, tenant isolation, and performance.

Last updated: 2026-06-02.

## Current System State

Eagle Info Repair Manager is no longer a simple repair-only scaffold. It is a Next.js App Router business system covering:

- Repair jobs, intake, clients, technicians, diagnosis, status flow, pricing, payouts, and job documents.
- Client-facing WhatsApp/email communications with an outbox, retry paths, templates, policies, and inbound message logging.
- Quotations, invoices, receipts, delivery notes, credit notes, refunds, and shared document numbering.
- Sales/POS, leads, campaigns, finance, expenses, inventory, procurement, stock, suppliers, and reports.
- Admin settings for users, orgs, branches, groups, branding, notifications, WhatsApp, billing, audit, and data health.
- Commercial multi-tenant behavior for subscription customers.

Primary stack:

- Next.js 16 App Router, React 19, TypeScript.
- Prisma 6.19 with SQLite schema provider.
- Local development database is SQLite file URL.
- Production runtime uses Turso/libSQL through `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- BetterAuth for auth/session.
- Tailwind/shadcn-style UI, Sonner/toasts, React Hook Form/Zod where forms are client-driven.
- Bun is the package/runtime command used by this repo.

## Branch Policy

The owner's current workflow is:

- `main` is priority production work.
- Commit and push `main` after verified fixes.
- `commercial` should be synced/committed locally after main, but do not push it unless the owner explicitly asks or the agreed "after 10 pushes to main" rule is reached.
- Do not push `commercial` by habit.
- Do not revert user or other-agent changes unless explicitly asked.

Before code work:

```bash
git status --short --branch
```

If changing code for production, work from `main` unless the owner explicitly says otherwise. After pushing `main`, fast-forward `commercial` locally when requested/appropriate:

```bash
git switch commercial
git merge --ff-only main
```

## Deployment Domains And Tenant Intent

The same codebase supports two deployment intents:

- `care.eagleinfosolutions.com`: Eagle Info's own repair business. Treat as effectively single tenant, but still keep server-side `orgId` filters where the data model requires them. Do not remove tenant safety just because care is single tenant.
- `app.eagleinfosolutions.com`: Commercial subscription product. Must enforce `orgId` everywhere commercial/customer data is accessed.

Auth trusted origins currently include the care domain, app domain, and Vercel deployments in `lib/auth.ts`.

Critical tenant rule:

- Every business query that reads or writes customer/org data must scope by the authenticated user's `orgId`, except platform-admin flows that intentionally operate across orgs.
- External technicians must never receive client PII or pricing history from server queries. UI hiding is not enough.

## Core Security Invariants

Always preserve these:

- Server-side role checks before DB writes and sensitive reads.
- External techs see only allowed job/device/diagnosis fields.
- `orgId` isolation for commercial routes and APIs.
- Append-only audit logs. Do not delete audit entries as a cleanup shortcut.
- File uploads must validate file type and size.
- Production auth must set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` or `NEXT_PUBLIC_APP_URL`.
- Production runtime must set Turso env vars. Local SQLite is only allowed in development/build/CI or when explicitly allowed.

## Job Status And Desired Messaging Behavior

Status changes are handled in `app/(app)/jobs/[id]/actions.ts`. When the persisted status changes, it calls `notifyStatusChange(...)` in `lib/notifications/index.ts`.

Desired behavior:

- Dashboard notification is created for ADMIN/OPS users whose preferences allow status-change notifications.
- Client WhatsApp/email messages use `CommunicationPolicy` when enabled for the new status.
- If WhatsApp policy is not enabled, a preference-gated fallback WhatsApp status update should still enqueue through `OutboundMessage` so the job Messages tab shows the attempt.
- Ready-for-pickup nudges are scheduled only when configured and should be cancelled when a job leaves `READY_FOR_PICKUP`.
- Status-triggered outbound messages must be linked to `jobId` and `orgId`.

Troubleshooting missing status messages:

1. Confirm the status actually changed in the DB, not just in the form state.
2. Confirm `notifyStatusChange` ran from `app/(app)/jobs/[id]/actions.ts`.
3. Check `NotificationPreferences.whatsappEnabled` for ADMIN/OPS users in the org.
4. Check `CommunicationPolicy` for the target status if expecting a template-specific send.
5. Check `OutboundMessage` rows for the job:

```sql
SELECT id, channel, status, type, jobId, orgId, to, lastError, createdAt
FROM OutboundMessage
WHERE jobId = '<jobId>'
ORDER BY createdAt DESC;
```

6. If a row exists but is `FAILED` or `DEAD`, inspect WhatsApp configuration and provider errors.
7. If no row exists, inspect preference/policy gates and whether the job has a client phone.

The job Messages tab reads outbound rows by `jobId` plus linked repair request rows. If the row exists with the right `jobId`, the UI should show it even when delivery failed.

## WhatsApp And Outbox Behavior

Key files:

- `lib/notifications/whatsapp.ts`: Meta WhatsApp configuration and direct provider calls.
- `lib/notifications/whatsapp-outbox.ts`: `enqueueWhatsAppMessage`, `enqueueEmailMessage`, and `deliverOutboundMessage`.
- `lib/notifications/index.ts`: business notification triggers.
- `app/api/cron/whatsapp-retry/route.ts`: retry path.
- `app/(app)/settings/notifications/outbox/page.tsx`: admin visibility.
- `app/(app)/settings/notifications/whatsapp/page.tsx`: WhatsApp config.

Desired behavior:

- User-visible sends should create an outbox row before provider delivery when the outbox schema exists.
- Delivery success updates status to `SENT`.
- Provider/config/network failures update status to `FAILED` or eventually `DEAD`, with `lastError`.
- PDF sends from jobs should also log a row before upload/send, so failed document sends remain visible.
- Org-specific WhatsApp configuration must be resolved by `orgId`; do not use a global config when an org-specific config applies.

Troubleshooting:

- No outbox row: trigger did not enqueue, the outbox table is missing/stale, or the code fell back because Prisma client is stale.
- Row pending forever: retry cron/worker not running, `nextAttemptAt` is future, or row is locked.
- Failed row: inspect `lastError`, `lastErrorCode`, provider credentials, phone format, Meta template approval, media upload, and org WhatsApp config.
- Messages tab empty: ensure row has the correct `jobId`; repair-request-only rows appear only when the request is linked to the job.

## Database And Prisma Runbook

The Prisma schema provider is SQLite. This means Prisma validation during build requires `DATABASE_URL` to start with `file:`.

Important files:

- `prisma/schema.prisma`: source of model truth.
- `lib/prisma.ts`: runtime client selection, local SQLite vs Turso/libSQL adapter, stale singleton guard, targeted runtime repairs.
- `scripts/vercel-build.mjs`: forces build-time `DATABASE_URL=file:./dev.db`, clears Turso env for build validation, generates Prisma client, asserts required models, then runs `next build`.
- `scripts/assert-prisma-models.mjs`: required model sanity check.
- `app/api/admin/db-fix/route.ts`: emergency production schema repair endpoint for platform/admin use.
- `scripts/prod-job-column-safety.mjs`: production job-column safety repair.

Common production DB errors and what they mean:

- `SQLite input error: no such column: main.Payment.kind`: production schema is behind code. Apply migrations/db fix for the `Payment.kind` column.
- `SQLite input error: no such column: lostReason`: production schema is behind code for leads. Apply the lead schema repair/migration.
- Prisma build error `URL must start with the protocol file:`: the build is validating the SQLite schema with a non-file runtime URL. Use `scripts/vercel-build.mjs` path; do not run raw `prisma generate`/`next build` in Vercel with Turso in `DATABASE_URL`.
- `Missing TURSO_DATABASE_URL`: production runtime started without Turso env vars.
- BetterAuth warnings during build about default secret/base URL: expected in local build if env is absent; production runtime must set proper values.

Local dev:

```bash
bun run dev
```

Schema/client:

```bash
bun run db:push
bun run prisma:generate
```

Production-style build:

```bash
bun run vercel-build
```

If the sandbox blocks Google Fonts, rerun the same build with network access rather than treating it as an app error.

## Documents And Numbering

The document workflow includes quotations, invoices, receipts, delivery notes, credit notes, refunds, and POS/sales documents. Shared document numbering logic lives under `lib/commercial/document-workflow` and related document modules.

Desired behavior:

- Winning/approved work should be convertible through the relevant document chain without losing job/sale/org context.
- Documents must be org-scoped.
- Generated PDFs must use branding settings for the org.
- WhatsApp/email PDF sends must log through outbox before provider delivery.
- Payments and refunds must update document status and totals consistently.

Troubleshooting document issues:

1. Confirm the source entity has `orgId`.
2. Confirm the document number sequence is using the correct org/year/type.
3. Confirm the document row links back to job, sale, invoice, credit note, or refund as expected.
4. Confirm the PDF route can fetch the same row server-side with `orgId`.
5. Confirm WhatsApp PDF send creates an `OutboundMessage` even if provider delivery fails.

## UI And Browser Troubleshooting

Use the in-app browser for local UI checks when the user is already viewing localhost.

Recent known UI behavior:

- Notification bell popover is expected to stay anchored inside the viewport, not open far off-screen.
- Notifications live inside the bell menu with unread/all behavior.
- Job Messages tab should display outbound and inbound job messages. It is not limited to sent messages.

UI checks:

- Verify mobile and desktop widths.
- Confirm controls do not overlap or overflow.
- Confirm role-hidden data is not present in the rendered page payload for unauthorized roles.
- Confirm buttons/forms have loading/error states for async actions.

## Performance Expectations

When investigating performance:

- Start with server query shape: avoid unscoped org-wide `findMany` with large includes.
- Paginate large lists: jobs, clients, outbound messages, invoices, inventory, audit logs.
- Prefer aggregate/count queries over loading rows for dashboard metrics.
- Keep dashboard calculations fresh by avoiding stale hard-coded values and by scoping all counts to the active org.
- Watch N+1 patterns in job lists, finance reports, inventory tables, and document pages.
- Use indexes already in Prisma schema for `orgId`, status, created dates, and document states.

Performance commands:

```bash
bun run qa:perf
bun run qa:all
```

Use targeted tests when the change is narrow; use broader QA for shared data, finance, documents, auth, or tenant behavior.

## Required Verification Before Commit

For production fixes, run:

```bash
bunx tsc --noEmit
bun run lint
bun audit
bun run vercel-build
```

If `bun audit` cannot connect because of sandbox/network restrictions, rerun with network permission. Do not skip it.

For broader system changes, also consider:

```bash
bun run test:unit
bun run qa:data-integrity
bun run qa:concurrency
bun run qa:http-security
bun run qa:pdf-smoke
bun run qa:rate-limit
bun run predeploy:check
```

For deployment gate:

```bash
bun run predeploy:ci
```

## Troubleshooting Checklist By Symptom

Messages not logged:

- Check `OutboundMessage` by `jobId`.
- Check `NotificationPreferences`.
- Check `CommunicationPolicy`.
- Check client phone/email exists.
- Check `orgId` was passed to enqueue/delivery.
- Check stale Prisma client/schema.

WhatsApp not sending:

- Check org WhatsApp settings.
- Check provider credentials, phone number ID, token, and template approval.
- Check outbox `lastError`.
- Check retry cron.
- Check media upload path for PDFs.

Notifications not showing:

- Check `Notification` rows by user/org.
- Check `NotificationBell` API response and unread/all filters.
- Check popover positioning only after data is confirmed present.

DB column missing:

- Confirm current deployed DB schema.
- Run admin db health/db fix if this is production and the missing column is known.
- Apply migration/db push in lower environments.
- Regenerate Prisma client after schema changes.

Dashboard wrong/stale:

- Check org filter.
- Check date boundaries/timezone.
- Check status lists include current `JobStatus` values.
- Check aggregate query vs loaded data mismatch.
- Check whether values are cached or statically generated unexpectedly.

External tech privacy issue:

- Inspect server query selects/includes, not just UI.
- Ensure `client`, phone, email, financial fields, invoices, payments, and pricing history are excluded.
- Confirm routes and APIs reject unauthorized roles.

Build fails on Vercel:

- Use `bun run vercel-build`.
- Ensure Prisma build validation sees `DATABASE_URL=file:./dev.db`.
- Ensure runtime env has Turso variables.
- Ensure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and trusted origins are configured.

## Coding Practices In This Repo

- Prefer existing helpers and patterns over new abstractions.
- Keep edits scoped.
- Use `rg` for search.
- Use `apply_patch` for manual file edits.
- Do not use destructive git commands unless explicitly requested.
- Preserve user/other-agent changes.
- Keep comments useful and sparse.
- Use ASCII in docs/code unless the file already requires Unicode.

## High-Risk Areas

Be extra careful around:

- Auth/session/role logic.
- Tenant scoping and `orgId`.
- External technician views.
- Prisma schema and production DB compatibility.
- WhatsApp/outbox retry behavior.
- Document numbering and finance totals.
- Payments, refunds, credit notes, and inventory stock changes.
- Dashboard metrics and cross-org aggregation.
- Build scripts that intentionally override DB env during build.

## Production Readiness Standard

A change is not production-ready just because it compiles. It should satisfy:

- Correct behavior for the target workflow.
- Server-side permission and tenant checks.
- Visible audit/outbox/logging where expected.
- No known DB drift for touched models.
- Passing typecheck, lint, audit, and production build.
- Manual/browser verification for UI-facing changes.
- Clear commit on `main` and push when the owner asked for production work.

