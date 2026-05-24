CREATE TABLE "SupplierBill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "supplierId" TEXT NOT NULL,
    "poId" TEXT,
    "grnId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "subtotal" REAL NOT NULL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierBill_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceived" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SupplierBillItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SupplierBill_billNumber_key" ON "SupplierBill"("billNumber");
CREATE INDEX "SupplierBill_orgId_issuedAt_idx" ON "SupplierBill"("orgId", "issuedAt");
CREATE INDEX "SupplierBill_orgId_status_idx" ON "SupplierBill"("orgId", "status");
CREATE INDEX "SupplierBill_supplierId_idx" ON "SupplierBill"("supplierId");
CREATE INDEX "SupplierBill_poId_idx" ON "SupplierBill"("poId");
CREATE INDEX "SupplierBill_grnId_idx" ON "SupplierBill"("grnId");
CREATE INDEX "SupplierBillItem_billId_idx" ON "SupplierBillItem"("billId");
