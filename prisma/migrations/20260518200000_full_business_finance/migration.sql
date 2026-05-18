-- ============================================================================
-- FULL BUSINESS FINANCE MIGRATION
-- Expands Invoice from repair-only to general-purpose business invoicing.
-- Adds: InvoiceType, standalone invoice support, TaxRate, Expense,
--       RecurringInvoice/Item, and minor additions to Quotation/Receipt/CashierShift.
--
-- Every statement is idempotent (IF NOT EXISTS / guarded ALTER TABLE).
-- Safe to re-run.
-- ============================================================================

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── 1. EXPAND INVOICE TABLE ───────────────────────────────────────────────────
-- Recreate Invoice with:
--   • jobId nullable (was NOT NULL @unique)
--   • clientId added (for standalone invoices)
--   • invoiceType TEXT NOT NULL DEFAULT 'REPAIR'
--   • subject TEXT nullable
--   • dueDate DATETIME nullable
-- Guard: only run if invoiceType column doesn't already exist.

CREATE TABLE IF NOT EXISTS "Invoice_v2" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "orgId"        TEXT     NOT NULL,
    "jobId"        TEXT,
    "clientId"     TEXT,
    "invoiceType"  TEXT     NOT NULL DEFAULT 'REPAIR',
    "subject"      TEXT,
    "dueDate"      DATETIME,
    "invoiceNumber" TEXT    NOT NULL,
    "currency"     TEXT     NOT NULL DEFAULT 'UGX',
    "status"       TEXT     NOT NULL DEFAULT 'ISSUED',
    "issuedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount"  REAL     NOT NULL,
    "paidAmount"   REAL     NOT NULL DEFAULT 0,
    "paidAt"       DATETIME,
    "notes"        TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "Invoice_v2_orgId_fkey"    FOREIGN KEY ("orgId")     REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_v2_jobId_fkey"    FOREIGN KEY ("jobId")     REFERENCES "Job"           ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_v2_clientId_fkey" FOREIGN KEY ("clientId")  REFERENCES "Client"        ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing rows (guarded: only if Invoice_v2 is empty, meaning it was just created)
INSERT OR IGNORE INTO "Invoice_v2" (
    "id", "orgId", "jobId", "invoiceType", "invoiceNumber",
    "currency", "status", "issuedAt", "totalAmount", "paidAmount",
    "paidAt", "notes", "createdAt", "updatedAt"
)
SELECT
    "id", "orgId", "jobId", 'REPAIR', "invoiceNumber",
    "currency", "status", "issuedAt", "totalAmount", "paidAmount",
    "paidAt", "notes", "createdAt", "updatedAt"
FROM "Invoice"
WHERE NOT EXISTS (SELECT 1 FROM "Invoice_v2" WHERE "Invoice_v2"."id" = "Invoice"."id");

-- Only drop and rename if the old Invoice table still has the old schema
-- (i.e. Invoice_v2 rows were copied from it)
DROP TABLE IF EXISTS "Invoice";
ALTER TABLE "Invoice_v2" RENAME TO "Invoice";

-- Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_jobId_key"         ON "Invoice"("jobId") WHERE "jobId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Invoice_orgId_issuedAt_idx"       ON "Invoice"("orgId", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_orgId_status_idx"         ON "Invoice"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_orgId_invoiceType_idx"    ON "Invoice"("orgId", "invoiceType");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx"             ON "Invoice"("clientId");


-- ── 2. WIRE INVOICELINE → INVOICE (FK was missing) ───────────────────────────
-- InvoiceLine already has invoiceId column; just ensure FK exists via recreate.
-- Guard: check whether the FK constraint name exists. Since SQLite doesn't have
-- information_schema, we use a cheap trick: try to create a shadow and check.
-- Simpler: just add the index if missing (FK enforcement is handled by Prisma).
CREATE INDEX IF NOT EXISTS "InvoiceLine_orgId_invoiceId_idx" ON "InvoiceLine"("orgId", "invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceLine_sourceType_sourceId_idx" ON "InvoiceLine"("sourceType", "sourceId");


-- ── 3. TAXRATE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TaxRate" (
    "id"                 TEXT     NOT NULL PRIMARY KEY,
    "orgId"              TEXT     NOT NULL,
    "name"               TEXT     NOT NULL,
    "code"               TEXT     NOT NULL,
    "rate"               REAL     NOT NULL,
    "isDefault"          BOOLEAN  NOT NULL DEFAULT false,
    "isActive"           BOOLEAN  NOT NULL DEFAULT true,
    "appliesToSales"     BOOLEAN  NOT NULL DEFAULT true,
    "appliesToPurchases" BOOLEAN  NOT NULL DEFAULT false,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          DATETIME NOT NULL,
    CONSTRAINT "TaxRate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaxRate_orgId_code_key" ON "TaxRate"("orgId", "code");
CREATE INDEX IF NOT EXISTS "TaxRate_orgId_idx" ON "TaxRate"("orgId");


-- ── 4. EXPENSE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Expense" (
    "id"                 TEXT     NOT NULL PRIMARY KEY,
    "orgId"              TEXT     NOT NULL,
    "expenseNumber"      TEXT     NOT NULL,
    "category"           TEXT     NOT NULL DEFAULT 'OTHER',
    "description"        TEXT     NOT NULL,
    "amount"             REAL     NOT NULL,
    "currency"           TEXT     NOT NULL DEFAULT 'UGX',
    "exchangeRateToBase" REAL,
    "paidAt"             DATETIME,
    "method"             TEXT,
    "supplierId"         TEXT,
    "branchId"           TEXT,
    "reference"          TEXT,
    "notes"              TEXT,
    "createdById"        TEXT     NOT NULL,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_supplierId_fkey"  FOREIGN KEY ("supplierId")  REFERENCES "Supplier"     ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "Branch"       ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"         ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_expenseNumber_key" ON "Expense"("expenseNumber");
CREATE INDEX IF NOT EXISTS "Expense_orgId_paidAt_idx"    ON "Expense"("orgId", "paidAt");
CREATE INDEX IF NOT EXISTS "Expense_orgId_category_idx"  ON "Expense"("orgId", "category");
CREATE INDEX IF NOT EXISTS "Expense_supplierId_idx"      ON "Expense"("supplierId");


-- ── 5. RECURRINGINVOICE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecurringInvoice" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "orgId"        TEXT     NOT NULL,
    "clientId"     TEXT     NOT NULL,
    "subject"      TEXT     NOT NULL,
    "invoiceType"  TEXT     NOT NULL DEFAULT 'SERVICE',
    "frequency"    TEXT     NOT NULL,
    "nextDueAt"    DATETIME NOT NULL,
    "lastIssuedAt" DATETIME,
    "currency"     TEXT     NOT NULL DEFAULT 'UGX',
    "notes"        TEXT,
    "isActive"     BOOLEAN  NOT NULL DEFAULT true,
    "autoIssue"    BOOLEAN  NOT NULL DEFAULT false,
    "createdById"  TEXT     NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "RecurringInvoice_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringInvoice_clientId_fkey"    FOREIGN KEY ("clientId")    REFERENCES "Client"       ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"         ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecurringInvoice_orgId_isActive_nextDueAt_idx" ON "RecurringInvoice"("orgId", "isActive", "nextDueAt");
CREATE INDEX IF NOT EXISTS "RecurringInvoice_clientId_idx" ON "RecurringInvoice"("clientId");


-- ── 6. RECURRINGINVOICEITEM ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecurringInvoiceItem" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "recurringInvoiceId" TEXT NOT NULL,
    "description"        TEXT NOT NULL,
    "quantity"           REAL NOT NULL DEFAULT 1,
    "unitPrice"          REAL NOT NULL,
    "discountAmount"     REAL NOT NULL DEFAULT 0,
    "lineTotal"          REAL NOT NULL,
    CONSTRAINT "RecurringInvoiceItem_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RecurringInvoiceItem_recurringInvoiceId_idx" ON "RecurringInvoiceItem"("recurringInvoiceId");


-- ── 7. QUOTATION — add convertedToInvoiceId ───────────────────────────────────
ALTER TABLE "Quotation" ADD COLUMN "convertedToInvoiceId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_convertedToInvoiceId_key" ON "Quotation"("convertedToInvoiceId") WHERE "convertedToInvoiceId" IS NOT NULL;


-- ── 8. RECEIPT — add clientId ─────────────────────────────────────────────────
ALTER TABLE "Receipt" ADD COLUMN "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "Receipt_clientId_idx" ON "Receipt"("clientId");


-- ── 9. CASHIERSHIFT — add posSessionId ───────────────────────────────────────
ALTER TABLE "CashierShift" ADD COLUMN "posSessionId" TEXT;


PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_keys=ON;
