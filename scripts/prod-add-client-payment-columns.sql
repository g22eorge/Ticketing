-- Production DB hotfix: add client payment/invoice columns required by Prisma Job model.
-- Run this in Turso shell against production:
--   turso db shell <db-name> < scripts/prod-add-client-payment-columns.sql

ALTER TABLE "Job" ADD COLUMN "clientPaid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "clientPaidAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "clientPaidById" TEXT;
ALTER TABLE "Job" ADD COLUMN "clientPaymentRef" TEXT;
ALTER TABLE "Job" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN "invoiceIssuedAt" DATETIME;

UPDATE "Job" SET "clientPaid" = 0 WHERE "clientPaid" IS NULL;

-- Verification
PRAGMA table_info('Job');
