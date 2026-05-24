CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SupplierPayment_orgId_paidAt_idx" ON "SupplierPayment"("orgId", "paidAt");
CREATE INDEX "SupplierPayment_billId_idx" ON "SupplierPayment"("billId");
