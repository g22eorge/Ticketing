# Production Readiness Checklist

Use this checklist to validate that the system not only works, but also fails safely.

## 1) Core Workflow Validation

- [ ] Intake creates new client + job with full required data.
- [ ] Internal technician can diagnose and move status through allowed transitions.
- [ ] External technician sees only non-PII fields and can update estimate/timeline.
- [ ] OPS can record approval/decline and move status accordingly.
- [ ] Accounts/Admin can set final cost and generate invoice export.

## 2) Failure and Edge Cases

- [ ] Invalid payloads are rejected server-side (missing required fields, bad enums, bad numbers).
- [ ] Duplicate client phone is handled without creating duplicate records.
- [ ] Duplicate submit (double-click) does not create duplicate jobs.
- [ ] Invalid status transition is blocked server-side.
- [ ] Stalled flow path is visible (e.g., AWAITING_APPROVAL jobs remain trackable).

## 3) Security and Access

- [ ] Unauthenticated access to protected routes/API is denied or redirected.
- [ ] External technician API responses never include client PII.
- [ ] Unauthorized role cannot mutate protected fields (e.g., clientBill, status transitions outside role).
- [ ] File upload route rejects unsupported types and >5MB files.

## 4) Stability and Concurrency

- [ ] Concurrent updates do not crash the app.
- [ ] Audit log remains append-only under concurrent writes.
- [ ] Pagination/filtering remains stable with larger datasets (50+ jobs).

## 5) Financial and Reporting Integrity

- [ ] Revenue metric equals sum(clientBill) for completed jobs in selected month.
- [ ] Estimate vs final variance export calculations are correct.
- [ ] Approval funnel and aging alerts match source job statuses.

## 6) Recovery and Persistence

- [ ] Seed and migrations are repeatable and idempotent.
- [ ] Data remains after logout/login and app restart.
- [ ] Upload paths persist correctly in configured storage.

## Automated Scripts

Run these scripts as a baseline:

- `bun run qa:data-integrity`
- `bun run qa:concurrency`
- `bun run qa:http-security` (requires running app at `QA_BASE_URL`)
- `bun run qa:all`
