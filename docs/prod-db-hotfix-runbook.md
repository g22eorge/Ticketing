# Production DB Hotfix Runbook (Job payment columns)

Use this runbook when production throws Prisma query errors like:

- `no such column: main.Job.clientPaid`

## Preconditions

- App is deployed with diagnostics endpoints:
  - `/api/admin/runtime-db`
  - `/api/admin/db-health`
  - `/api/admin/probe`
- You have Turso CLI access and ADMIN app access.

## 1) Confirm runtime is using Turso

Open `/api/admin/runtime-db`.

Expected:

- `mode: "turso"`
- `warnings: []`

If not, fix runtime env first (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) and redeploy.

## 2) Confirm missing columns

Open `/api/admin/db-health` and inspect `jobColumnsPresent`.

If any are false, proceed with patch:

- `clientPaid`
- `clientPaidAt`
- `clientPaidById`
- `clientPaymentRef`
- `invoiceNumber`
- `invoiceIssuedAt`

## 3) Apply SQL patch in Turso

Run:

```bash
turso db shell <db-name>
```

Then execute SQL from `scripts/prod-add-client-payment-columns.sql`.

Notes:

- If you get `duplicate column name`, continue with remaining statements.
- The `UPDATE` statement is safe and idempotent.

## 4) Verify app health

Refresh:

- `/api/admin/db-health` (all six columns should be `true`)
- `/api/admin/probe` (should be fully `ok: true`)

Critical probe checks that must pass:

- `dashboard:assignedToInclude`
- `jobs:clientRelationFilterSearch`
- `dashboard:adminLargePromiseAll`

## 5) Final checks

- Hard refresh `/dashboard` and `/jobs`.
- If errors persist, trigger a fresh production redeploy (clear cache if available).
