-- ============================================================================
-- COMPREHENSIVE PRODUCTION MIGRATION
-- Covers all new tables introduced after 20260507123205_add_billing_fields.
-- Every CREATE TABLE uses IF NOT EXISTS for idempotency — safe to re-run.
-- RedefineTables (ALTER TABLE with new columns) are guarded by IF NOT EXISTS
-- on a shadow table and a three-step replace pattern.
-- ============================================================================

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── 1. BRANCH & LOCATION ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Branch" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "orgId"     TEXT    NOT NULL,
    "name"      TEXT    NOT NULL,
    "address"   TEXT,
    "phone"     TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Branch_orgId_idx" ON "Branch"("orgId");

CREATE TABLE IF NOT EXISTS "BranchOperatingHours" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "branchId"   TEXT NOT NULL,
    "dayOfWeek"  INTEGER NOT NULL,
    "openTime"   TEXT,
    "closeTime"  TEXT,
    "isOpen"     BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BranchOperatingHours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BranchOperatingHours_branchId_dayOfWeek_key" ON "BranchOperatingHours"("branchId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "BranchOperatingHours_branchId_idx" ON "BranchOperatingHours"("branchId");

CREATE TABLE IF NOT EXISTS "BranchNumberingSettings" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "branchId"        TEXT NOT NULL,
    "jobPrefix"       TEXT,
    "invoicePrefix"   TEXT,
    "salePrefix"      TEXT,
    "quotePrefix"     TEXT,
    "updatedAt"       DATETIME NOT NULL,
    CONSTRAINT "BranchNumberingSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BranchNumberingSettings_branchId_key" ON "BranchNumberingSettings"("branchId");

-- ── 2. DEPARTMENT ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Department" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "name"      TEXT    NOT NULL,
    "code"      TEXT    NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Department_code_key" ON "Department"("code");

-- ── 3. USER GROUPS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "UserGroup" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "UserGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserGroup_orgId_name_key" ON "UserGroup"("orgId", "name");
CREATE INDEX IF NOT EXISTS "UserGroup_orgId_createdAt_idx" ON "UserGroup"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "UserGroupMember" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "groupId"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserGroupMember_groupId_userId_key" ON "UserGroupMember"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");

CREATE TABLE IF NOT EXISTS "UserGroupPermission" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "groupId"    TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserGroupPermission_groupId_permission_key" ON "UserGroupPermission"("groupId", "permission");
CREATE INDEX IF NOT EXISTS "UserGroupPermission_permission_idx" ON "UserGroupPermission"("permission");

-- ── 4. SUPPLIER ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Supplier" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "orgId"       TEXT    NOT NULL,
    "name"        TEXT    NOT NULL,
    "contactName" TEXT,
    "email"       TEXT,
    "phone"       TEXT,
    "address"     TEXT,
    "notes"       TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Supplier_orgId_idx" ON "Supplier"("orgId");

CREATE TABLE IF NOT EXISTS "SupplierPrice" (
    "id"           TEXT  NOT NULL PRIMARY KEY,
    "orgId"        TEXT  NOT NULL,
    "supplierId"   TEXT  NOT NULL,
    "partId"       TEXT,
    "sku"          TEXT,
    "description"  TEXT  NOT NULL,
    "unitCost"     REAL  NOT NULL,
    "currency"     TEXT  NOT NULL DEFAULT 'UGX',
    "minQuantity"  INTEGER,
    "leadTimeDays" INTEGER,
    "validFrom"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo"      DATETIME,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupplierPrice_orgId_supplierId_validFrom_idx" ON "SupplierPrice"("orgId", "supplierId", "validFrom");
CREATE INDEX IF NOT EXISTS "SupplierPrice_partId_validFrom_idx" ON "SupplierPrice"("partId", "validFrom");

-- ── 5. INVENTORY ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "InventoryCategory" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "orgId"     TEXT    NOT NULL,
    "name"      TEXT    NOT NULL,
    "parentId"  TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCategory_orgId_name_key" ON "InventoryCategory"("orgId", "name");
CREATE INDEX IF NOT EXISTS "InventoryCategory_orgId_isActive_idx" ON "InventoryCategory"("orgId", "isActive");

CREATE TABLE IF NOT EXISTS "StockLocation" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "orgId"     TEXT    NOT NULL,
    "branchId"  TEXT,
    "name"      TEXT    NOT NULL,
    "code"      TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockLocation_orgId_code_key" ON "StockLocation"("orgId", "code");
CREATE INDEX IF NOT EXISTS "StockLocation_orgId_branchId_isActive_idx" ON "StockLocation"("orgId", "branchId", "isActive");

CREATE TABLE IF NOT EXISTS "PartLocationStock" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "orgId"       TEXT    NOT NULL,
    "partId"      TEXT    NOT NULL,
    "locationId"  TEXT    NOT NULL,
    "qtyOnHand"   INTEGER NOT NULL DEFAULT 0,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "PartLocationStock_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartLocationStock_partId_locationId_key" ON "PartLocationStock"("partId", "locationId");
CREATE INDEX IF NOT EXISTS "PartLocationStock_orgId_locationId_idx" ON "PartLocationStock"("orgId", "locationId");
CREATE INDEX IF NOT EXISTS "PartLocationStock_partId_idx" ON "PartLocationStock"("partId");

CREATE TABLE IF NOT EXISTS "ReorderRule" (
    "id"                  TEXT    NOT NULL PRIMARY KEY,
    "orgId"               TEXT    NOT NULL,
    "partId"              TEXT    NOT NULL,
    "locationId"          TEXT,
    "minQty"              INTEGER NOT NULL DEFAULT 0,
    "targetQty"           INTEGER NOT NULL DEFAULT 0,
    "preferredSupplierId" TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReorderRule_partId_locationId_key" ON "ReorderRule"("partId", "locationId");
CREATE INDEX IF NOT EXISTS "ReorderRule_orgId_isActive_idx" ON "ReorderRule"("orgId", "isActive");

-- ── 6. STOCK TRANSFERS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StockTransfer" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "orgId"          TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'REQUESTED',
    "fromLocationId" TEXT NOT NULL,
    "toLocationId"   TEXT NOT NULL,
    "requestedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"     DATETIME,
    "dispatchedAt"   DATETIME,
    "receivedAt"     DATETIME,
    "cancelledAt"    DATETIME,
    "note"           TEXT,
    "createdById"    TEXT NOT NULL,
    "approvedById"   TEXT,
    "dispatchedById" TEXT,
    "receivedById"   TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "StockTransfer_orgId_fkey"        FOREIGN KEY ("orgId")          REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_createdById_fkey"  FOREIGN KEY ("createdById")    REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_approvedById_fkey" FOREIGN KEY ("approvedById")   REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById")   REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_transferNumber_key" ON "StockTransfer"("transferNumber");
CREATE INDEX IF NOT EXISTS "StockTransfer_orgId_status_createdAt_idx" ON "StockTransfer"("orgId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "StockTransfer_fromLocationId_idx" ON "StockTransfer"("fromLocationId");
CREATE INDEX IF NOT EXISTS "StockTransfer_toLocationId_idx" ON "StockTransfer"("toLocationId");

CREATE TABLE IF NOT EXISTS "StockTransferItem" (
    "id"            TEXT    NOT NULL PRIMARY KEY,
    "transferId"    TEXT    NOT NULL,
    "partId"        TEXT    NOT NULL,
    "quantity"      INTEGER NOT NULL,
    "qtyDispatched" INTEGER NOT NULL DEFAULT 0,
    "qtyReceived"   INTEGER NOT NULL DEFAULT 0,
    "note"          TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockTransferItem_partId_fkey"     FOREIGN KEY ("partId")     REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");
CREATE INDEX IF NOT EXISTS "StockTransferItem_partId_idx"     ON "StockTransferItem"("partId");

-- ── 7. STOCK COUNT ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StockCount" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT NOT NULL,
    "countNumber"  TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'DRAFT',
    "locationId"   TEXT NOT NULL,
    "countedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt"  DATETIME,
    "approvedAt"   DATETIME,
    "note"         TEXT,
    "createdById"  TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "StockCount_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCount_locationId_fkey"  FOREIGN KEY ("locationId")  REFERENCES "StockLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockCount_countNumber_key" ON "StockCount"("countNumber");
CREATE INDEX IF NOT EXISTS "StockCount_orgId_status_countedAt_idx" ON "StockCount"("orgId", "status", "countedAt");
CREATE INDEX IF NOT EXISTS "StockCount_locationId_idx" ON "StockCount"("locationId");

CREATE TABLE IF NOT EXISTS "StockCountItem" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "stockCountId" TEXT    NOT NULL,
    "partId"       TEXT    NOT NULL,
    "systemQty"    INTEGER NOT NULL,
    "countedQty"   INTEGER NOT NULL,
    "varianceQty"  INTEGER NOT NULL,
    "note"         TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCountItem_partId_fkey"        FOREIGN KEY ("partId")       REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "StockCountItem_stockCountId_idx" ON "StockCountItem"("stockCountId");
CREATE INDEX IF NOT EXISTS "StockCountItem_partId_idx"       ON "StockCountItem"("partId");

-- ── 8. PROCUREMENT — PURCHASE ORDERS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "orgId"      TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'DRAFT',
    "reference"  TEXT,
    "orderedAt"  DATETIME,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "notes"      TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_orgId_fkey"      FOREIGN KEY ("orgId")      REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseOrder_orgId_idx"      ON "PurchaseOrder"("orgId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "poId"        TEXT    NOT NULL,
    "partId"      TEXT,
    "description" TEXT    NOT NULL,
    "qtyOrdered"  INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCost"    REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrderItem_poId_fkey"    FOREIGN KEY ("poId")    REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_partId_fkey"  FOREIGN KEY ("partId")  REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_poId_idx"   ON "PurchaseOrderItem"("poId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_partId_idx" ON "PurchaseOrderItem"("partId");

-- ── 9. PROCUREMENT — GOODS RECEIVED ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "GoodsReceived" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "grnNumber"   TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'POSTED',
    "supplierId"  TEXT NOT NULL,
    "poId"        TEXT,
    "locationId"  TEXT NOT NULL,
    "receivedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"        TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "GoodsReceived_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_supplierId_fkey"  FOREIGN KEY ("supplierId")  REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_poId_fkey"        FOREIGN KEY ("poId")        REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_locationId_fkey"  FOREIGN KEY ("locationId")  REFERENCES "StockLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceived_grnNumber_key"           ON "GoodsReceived"("grnNumber");
CREATE INDEX IF NOT EXISTS "GoodsReceived_orgId_receivedAt_idx"           ON "GoodsReceived"("orgId", "receivedAt");
CREATE INDEX IF NOT EXISTS "GoodsReceived_supplierId_idx"                 ON "GoodsReceived"("supplierId");
CREATE INDEX IF NOT EXISTS "GoodsReceived_poId_idx"                       ON "GoodsReceived"("poId");
CREATE INDEX IF NOT EXISTS "GoodsReceived_locationId_idx"                 ON "GoodsReceived"("locationId");

CREATE TABLE IF NOT EXISTS "GoodsReceivedItem" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "grnId"       TEXT    NOT NULL,
    "poItemId"    TEXT,
    "partId"      TEXT,
    "description" TEXT    NOT NULL,
    "quantity"    INTEGER NOT NULL,
    "unitCost"    REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsReceivedItem_grnId_fkey"  FOREIGN KEY ("grnId")  REFERENCES "GoodsReceived" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceivedItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "GoodsReceivedItem_grnId_idx"    ON "GoodsReceivedItem"("grnId");
CREATE INDEX IF NOT EXISTS "GoodsReceivedItem_partId_idx"   ON "GoodsReceivedItem"("partId");
CREATE INDEX IF NOT EXISTS "GoodsReceivedItem_poItemId_idx" ON "GoodsReceivedItem"("poItemId");

-- ── 10. PROCUREMENT — SUPPLIER BILLS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SupplierBill" (
    "id"          TEXT  NOT NULL PRIMARY KEY,
    "orgId"       TEXT  NOT NULL,
    "billNumber"  TEXT  NOT NULL,
    "supplierRef" TEXT,
    "status"      TEXT  NOT NULL DEFAULT 'POSTED',
    "supplierId"  TEXT  NOT NULL,
    "poId"        TEXT,
    "grnId"       TEXT,
    "currency"    TEXT  NOT NULL DEFAULT 'UGX',
    "subtotal"    REAL  NOT NULL,
    "taxAmount"   REAL  NOT NULL DEFAULT 0,
    "totalAmount" REAL  NOT NULL,
    "paidAmount"  REAL  NOT NULL DEFAULT 0,
    "issuedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"       DATETIME,
    "notes"       TEXT,
    "createdById" TEXT  NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "SupplierBill_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_supplierId_fkey"  FOREIGN KEY ("supplierId")  REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_poId_fkey"        FOREIGN KEY ("poId")        REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_grnId_fkey"       FOREIGN KEY ("grnId")       REFERENCES "GoodsReceived" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SupplierBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierBill_billNumber_key"    ON "SupplierBill"("billNumber");
CREATE INDEX IF NOT EXISTS "SupplierBill_orgId_issuedAt_idx"       ON "SupplierBill"("orgId", "issuedAt");
CREATE INDEX IF NOT EXISTS "SupplierBill_orgId_status_idx"         ON "SupplierBill"("orgId", "status");
CREATE INDEX IF NOT EXISTS "SupplierBill_supplierId_idx"           ON "SupplierBill"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierBill_poId_idx"                 ON "SupplierBill"("poId");
CREATE INDEX IF NOT EXISTS "SupplierBill_grnId_idx"                ON "SupplierBill"("grnId");

CREATE TABLE IF NOT EXISTS "SupplierBillItem" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "billId"      TEXT    NOT NULL,
    "description" TEXT    NOT NULL,
    "quantity"    INTEGER NOT NULL,
    "unitCost"    REAL    NOT NULL,
    "lineTotal"   REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SupplierBill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupplierBillItem_billId_idx" ON "SupplierBillItem"("billId");

CREATE TABLE IF NOT EXISTS "SupplierPayment" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "billId"      TEXT NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'UGX',
    "amount"      REAL NOT NULL,
    "method"      TEXT NOT NULL DEFAULT 'CASH',
    "reference"   TEXT,
    "paidAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"        TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_billId_fkey"      FOREIGN KEY ("billId")      REFERENCES "SupplierBill" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupplierPayment_orgId_paidAt_idx" ON "SupplierPayment"("orgId", "paidAt");
CREATE INDEX IF NOT EXISTS "SupplierPayment_billId_idx"        ON "SupplierPayment"("billId");

-- ── 11. PROCUREMENT — PURCHASE REQUESTS ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PurchaseRequest" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "orgId"          TEXT NOT NULL,
    "requestNumber"  TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'SUBMITTED',
    "priority"       TEXT NOT NULL DEFAULT 'NORMAL',
    "supplierId"     TEXT,
    "neededBy"       DATETIME,
    "reason"         TEXT,
    "notes"          TEXT,
    "requestedById"  TEXT NOT NULL,
    "reviewedById"   TEXT,
    "reviewedAt"     DATETIME,
    "reviewNote"     TEXT,
    "convertedPoId"  TEXT,
    "convertedAt"    DATETIME,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "PurchaseRequest_orgId_fkey"         FOREIGN KEY ("orgId")         REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_supplierId_fkey"    FOREIGN KEY ("supplierId")    REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_reviewedById_fkey"  FOREIGN KEY ("reviewedById")  REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequest_convertedPoId_fkey" FOREIGN KEY ("convertedPoId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequest_requestNumber_key"            ON "PurchaseRequest"("requestNumber");
CREATE INDEX IF NOT EXISTS "PurchaseRequest_orgId_status_createdAt_idx"          ON "PurchaseRequest"("orgId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseRequest_supplierId_idx"                      ON "PurchaseRequest"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseRequest_requestedById_idx"                   ON "PurchaseRequest"("requestedById");

CREATE TABLE IF NOT EXISTS "PurchaseRequestItem" (
    "id"                TEXT    NOT NULL PRIMARY KEY,
    "requestId"         TEXT    NOT NULL,
    "partId"            TEXT,
    "description"       TEXT    NOT NULL,
    "quantity"          INTEGER NOT NULL,
    "estimatedUnitCost" REAL,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseRequestItem_partId_fkey"    FOREIGN KEY ("partId")    REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseRequestItem_requestId_idx" ON "PurchaseRequestItem"("requestId");
CREATE INDEX IF NOT EXISTS "PurchaseRequestItem_partId_idx"    ON "PurchaseRequestItem"("partId");

-- ── 12. INVOICING & PAYMENTS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id"            TEXT  NOT NULL PRIMARY KEY,
    "orgId"         TEXT  NOT NULL,
    "jobId"         TEXT  NOT NULL,
    "invoiceNumber" TEXT  NOT NULL,
    "currency"      TEXT  NOT NULL DEFAULT 'UGX',
    "status"        TEXT  NOT NULL DEFAULT 'ISSUED',
    "issuedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount"   REAL  NOT NULL,
    "paidAmount"    REAL  NOT NULL DEFAULT 0,
    "paidAt"        DATETIME,
    "notes"         TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "Invoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key"   ON "Invoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_orgId_issuedAt_idx"         ON "Invoice"("orgId", "issuedAt");
CREATE INDEX IF NOT EXISTS "Invoice_orgId_status_idx"           ON "Invoice"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_jobId_idx"                  ON "Invoice"("jobId");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "invoiceId"   TEXT    NOT NULL,
    "partId"      TEXT,
    "description" TEXT    NOT NULL,
    "quantity"    INTEGER NOT NULL DEFAULT 1,
    "unitPrice"   REAL    NOT NULL,
    "lineTotal"   REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_partId_fkey"    FOREIGN KEY ("partId")    REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

CREATE TABLE IF NOT EXISTS "DocumentTaxLine" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId"   TEXT NOT NULL,
    "taxName"      TEXT NOT NULL,
    "rate"         REAL NOT NULL,
    "amount"       REAL NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DocumentTaxLine_orgId_documentType_documentId_idx" ON "DocumentTaxLine"("orgId", "documentType", "documentId");

CREATE TABLE IF NOT EXISTS "Payment" (
    "id"                 TEXT  NOT NULL PRIMARY KEY,
    "orgId"              TEXT  NOT NULL,
    "invoiceId"          TEXT,
    "saleId"             TEXT,
    "currency"           TEXT  NOT NULL DEFAULT 'UGX',
    "exchangeRateToBase" REAL,
    "amount"             REAL  NOT NULL,
    "method"             TEXT  NOT NULL DEFAULT 'CASH',
    "reference"          TEXT,
    "receivedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById"        TEXT,
    "note"               TEXT,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey"   FOREIGN KEY ("invoiceId")   REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Payment_orgId_receivedAt_idx" ON "Payment"("orgId", "receivedAt");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx"         ON "Payment"("invoiceId");
CREATE INDEX IF NOT EXISTS "Payment_saleId_idx"            ON "Payment"("saleId");

CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "saleId"    TEXT,
    "amount"    REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

CREATE TABLE IF NOT EXISTS "Receipt" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "orgId"         TEXT NOT NULL,
    "paymentId"     TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_orgId_fkey"      FOREIGN KEY ("orgId")      REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_paymentId_fkey"  FOREIGN KEY ("paymentId")  REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");
CREATE INDEX IF NOT EXISTS "Receipt_paymentId_idx"            ON "Receipt"("paymentId");
CREATE INDEX IF NOT EXISTS "Receipt_orgId_issuedAt_idx"       ON "Receipt"("orgId", "issuedAt");

CREATE TABLE IF NOT EXISTS "Refund" (
    "id"                 TEXT  NOT NULL PRIMARY KEY,
    "orgId"              TEXT  NOT NULL,
    "saleId"             TEXT,
    "invoiceId"          TEXT,
    "creditNoteId"       TEXT,
    "currency"           TEXT  NOT NULL DEFAULT 'UGX',
    "exchangeRateToBase" REAL,
    "amount"             REAL  NOT NULL,
    "method"             TEXT  NOT NULL DEFAULT 'CASH',
    "reference"          TEXT,
    "refundedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById"        TEXT  NOT NULL,
    "note"               TEXT,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_orgId_fkey"        FOREIGN KEY ("orgId")        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_createdById_fkey"  FOREIGN KEY ("createdById")  REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Refund_orgId_refundedAt_idx" ON "Refund"("orgId", "refundedAt");
CREATE INDEX IF NOT EXISTS "Refund_saleId_idx"           ON "Refund"("saleId");
CREATE INDEX IF NOT EXISTS "Refund_invoiceId_idx"        ON "Refund"("invoiceId");
CREATE INDEX IF NOT EXISTS "Refund_creditNoteId_idx"     ON "Refund"("creditNoteId");

-- ── 13. SALES & CREDIT NOTES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Sale" (
    "id"             TEXT  NOT NULL PRIMARY KEY,
    "orgId"          TEXT  NOT NULL,
    "branchId"       TEXT,
    "clientId"       TEXT,
    "posSessionId"   TEXT,
    "status"         TEXT  NOT NULL DEFAULT 'OPEN',
    "saleNumber"     TEXT  NOT NULL,
    "billingMode"    TEXT  NOT NULL DEFAULT 'CASH',
    "invoiceNumber"  TEXT,
    "invoicedAt"     DATETIME,
    "currency"       TEXT  NOT NULL DEFAULT 'UGX',
    "subtotal"       REAL  NOT NULL DEFAULT 0,
    "discountAmount" REAL  NOT NULL DEFAULT 0,
    "vatAmount"      REAL  NOT NULL DEFAULT 0,
    "totalAmount"    REAL  NOT NULL DEFAULT 0,
    "paidAmount"     REAL  NOT NULL DEFAULT 0,
    "paidAt"         DATETIME,
    "notes"          TEXT,
    "createdById"    TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "Sale_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sale_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_clientId_fkey"    FOREIGN KEY ("clientId")    REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_saleNumber_key"      ON "Sale"("saleNumber");
CREATE INDEX IF NOT EXISTS "Sale_orgId_createdAt_idx"        ON "Sale"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_orgId_status_idx"           ON "Sale"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Sale_branchId_idx"               ON "Sale"("branchId");
CREATE INDEX IF NOT EXISTS "Sale_clientId_idx"               ON "Sale"("clientId");
CREATE INDEX IF NOT EXISTS "Sale_posSessionId_idx"           ON "Sale"("posSessionId");

CREATE TABLE IF NOT EXISTS "SaleItem" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "saleId"      TEXT    NOT NULL,
    "partId"      TEXT,
    "description" TEXT    NOT NULL,
    "quantity"    INTEGER NOT NULL DEFAULT 1,
    "unitPrice"   REAL    NOT NULL,
    "lineTotal"   REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleItem_saleId_fkey"  FOREIGN KEY ("saleId")  REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_partId_fkey"  FOREIGN KEY ("partId")  REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx"  ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_partId_idx"  ON "SaleItem"("partId");

CREATE TABLE IF NOT EXISTS "CreditNote" (
    "id"                    TEXT  NOT NULL PRIMARY KEY,
    "orgId"                 TEXT  NOT NULL,
    "saleId"                TEXT  NOT NULL,
    "creditNoteNumber"      TEXT  NOT NULL,
    "currency"              TEXT  NOT NULL DEFAULT 'UGX',
    "totalAmount"           REAL  NOT NULL,
    "issuedAt"              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason"                TEXT,
    "itemsReceivedBackAt"   DATETIME,
    "itemsReceivedBackById" TEXT,
    "itemsReceivedBackNote" TEXT,
    "createdById"           TEXT  NOT NULL,
    "createdAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_orgId_fkey"                  FOREIGN KEY ("orgId")                  REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_saleId_fkey"                 FOREIGN KEY ("saleId")                 REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_itemsReceivedBackById_fkey"  FOREIGN KEY ("itemsReceivedBackById")  REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_createdById_fkey"            FOREIGN KEY ("createdById")            REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");
CREATE INDEX IF NOT EXISTS "CreditNote_orgId_issuedAt_idx"          ON "CreditNote"("orgId", "issuedAt");
CREATE INDEX IF NOT EXISTS "CreditNote_saleId_idx"                  ON "CreditNote"("saleId");

CREATE TABLE IF NOT EXISTS "CreditNoteItem" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "creditNoteId" TEXT    NOT NULL,
    "partId"       TEXT,
    "description"  TEXT    NOT NULL,
    "quantity"     INTEGER NOT NULL,
    "unitPrice"    REAL    NOT NULL,
    "lineTotal"    REAL    NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNoteItem_partId_fkey"        FOREIGN KEY ("partId")       REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");
CREATE INDEX IF NOT EXISTS "CreditNoteItem_partId_idx"        ON "CreditNoteItem"("partId");

-- ── 14. DELIVERY NOTES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeliveryNote" (
    "id"                      TEXT NOT NULL PRIMARY KEY,
    "orgId"                   TEXT NOT NULL,
    "saleId"                  TEXT,
    "invoiceId"               TEXT,
    "deliveryNoteNumber"      TEXT NOT NULL,
    "deliveredAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryMethod"          TEXT,
    "deliveredByName"         TEXT NOT NULL,
    "receivedByName"          TEXT NOT NULL,
    "receivedBySignatureText" TEXT,
    "note"                    TEXT,
    "createdById"             TEXT,
    "createdAt"               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryNote_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_saleId_fkey"      FOREIGN KEY ("saleId")      REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_invoiceId_fkey"   FOREIGN KEY ("invoiceId")   REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNote_deliveryNoteNumber_key" ON "DeliveryNote"("deliveryNoteNumber");
CREATE INDEX IF NOT EXISTS "DeliveryNote_orgId_deliveredAt_idx"         ON "DeliveryNote"("orgId", "deliveredAt");
CREATE INDEX IF NOT EXISTS "DeliveryNote_saleId_idx"                    ON "DeliveryNote"("saleId");
CREATE INDEX IF NOT EXISTS "DeliveryNote_invoiceId_idx"                 ON "DeliveryNote"("invoiceId");

CREATE TABLE IF NOT EXISTS "DeliveryNoteItem" (
    "id"             TEXT    NOT NULL PRIMARY KEY,
    "deliveryNoteId" TEXT    NOT NULL,
    "saleItemId"     TEXT,
    "partId"         TEXT,
    "description"    TEXT    NOT NULL,
    "quantity"       INTEGER NOT NULL,
    CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNoteItem_saleItemId_fkey"     FOREIGN KEY ("saleItemId")     REFERENCES "SaleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNoteItem_partId_fkey"          FOREIGN KEY ("partId")         REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");
CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_saleItemId_idx"     ON "DeliveryNoteItem"("saleItemId");
CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_partId_idx"         ON "DeliveryNoteItem"("partId");

-- ── 15. POS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CashierShift" (
    "id"                   TEXT  NOT NULL PRIMARY KEY,
    "orgId"                TEXT  NOT NULL,
    "branchId"             TEXT,
    "cashierId"            TEXT  NOT NULL,
    "status"               TEXT  NOT NULL DEFAULT 'OPEN',
    "openingFloat"         REAL  NOT NULL DEFAULT 0,
    "closingCash"          REAL,
    "expectedCash"         REAL,
    "cashVariance"         REAL,
    "openedAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"             DATETIME,
    "notes"                TEXT,
    CONSTRAINT "CashierShift_orgId_fkey"    FOREIGN KEY ("orgId")    REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashierShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CashierShift_orgId_branchId_status_idx"  ON "CashierShift"("orgId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "CashierShift_cashierId_openedAt_idx"      ON "CashierShift"("cashierId", "openedAt");

CREATE TABLE IF NOT EXISTS "PosSession" (
    "id"                   TEXT  NOT NULL PRIMARY KEY,
    "orgId"                TEXT,
    "branchId"             TEXT,
    "operatorId"           TEXT  NOT NULL,
    "status"               TEXT  NOT NULL DEFAULT 'OPEN',
    "openingFloat"         REAL  NOT NULL DEFAULT 0,
    "closingCash"          REAL,
    "cashTotal"            REAL  NOT NULL DEFAULT 0,
    "cardTotal"            REAL  NOT NULL DEFAULT 0,
    "mobileTotal"          REAL  NOT NULL DEFAULT 0,
    "totalSales"           REAL  NOT NULL DEFAULT 0,
    "salesCount"           INTEGER NOT NULL DEFAULT 0,
    "actualClosingBalance" REAL,
    "openedAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"             DATETIME,
    "notes"                TEXT,
    CONSTRAINT "PosSession_orgId_fkey"      FOREIGN KEY ("orgId")      REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosSession_branchId_fkey"   FOREIGN KEY ("branchId")   REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PosSession_orgId_status_idx"          ON "PosSession"("orgId", "status");
CREATE INDEX IF NOT EXISTS "PosSession_operatorId_openedAt_idx"   ON "PosSession"("operatorId", "openedAt");
CREATE INDEX IF NOT EXISTS "PosSession_branchId_idx"              ON "PosSession"("branchId");

-- ── 16. COMPLAINTS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Complaint" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "orgId"            TEXT NOT NULL,
    "complaintNumber"  TEXT NOT NULL,
    "clientId"         TEXT,
    "jobId"            TEXT,
    "channel"          TEXT NOT NULL DEFAULT 'IN_PERSON',
    "category"         TEXT NOT NULL DEFAULT 'SERVICE_QUALITY',
    "status"           TEXT NOT NULL DEFAULT 'OPEN',
    "description"      TEXT NOT NULL,
    "resolutionNote"   TEXT,
    "resolvedAt"       DATETIME,
    "assignedToId"     TEXT,
    "createdById"      TEXT NOT NULL,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "Complaint_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Complaint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_complaintNumber_key"      ON "Complaint"("complaintNumber");
CREATE INDEX IF NOT EXISTS "Complaint_orgId_createdAt_idx"             ON "Complaint"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "Complaint_orgId_status_createdAt_idx"      ON "Complaint"("orgId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Complaint_jobId_idx"                       ON "Complaint"("jobId");

-- ── 17. SALES TARGETS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SalesTarget" (
    "id"            TEXT  NOT NULL PRIMARY KEY,
    "orgId"         TEXT  NOT NULL,
    "userId"        TEXT,
    "departmentId"  TEXT,
    "branchId"      TEXT,
    "setById"       TEXT,
    "entityType"    TEXT  NOT NULL DEFAULT 'COMPANY',
    "metric"        TEXT  NOT NULL DEFAULT 'REVENUE',
    "period"        TEXT  NOT NULL,
    "periodLabel"   TEXT,
    "targetRevenue" REAL  NOT NULL DEFAULT 0,
    "targetJobs"    INTEGER NOT NULL DEFAULT 0,
    "targetValue"   REAL  NOT NULL DEFAULT 0,
    "actualValue"   REAL  NOT NULL DEFAULT 0,
    "notes"         TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "SalesTarget_orgId_fkey"  FOREIGN KEY ("orgId")  REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SalesTarget_orgId_period_idx"              ON "SalesTarget"("orgId", "period");
CREATE INDEX IF NOT EXISTS "SalesTarget_entityType_period_periodLabel_idx" ON "SalesTarget"("entityType", "period", "periodLabel");
CREATE INDEX IF NOT EXISTS "SalesTarget_userId_idx"                    ON "SalesTarget"("userId");
CREATE INDEX IF NOT EXISTS "SalesTarget_branchId_idx"                  ON "SalesTarget"("branchId");

-- ── 18. LEADS & QUOTATIONS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Lead" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "orgId"          TEXT,
    "branchId"       TEXT,
    "fullName"       TEXT NOT NULL,
    "phone"          TEXT NOT NULL,
    "email"          TEXT,
    "organization"   TEXT,
    "interest"       TEXT,
    "source"         TEXT NOT NULL DEFAULT 'WALK_IN',
    "status"         TEXT NOT NULL DEFAULT 'NEW',
    "estimatedValue" REAL,
    "notes"          TEXT,
    "clientId"       TEXT,
    "assignedToId"   TEXT,
    "createdById"    TEXT,
    "convertedAt"    DATETIME,
    "closedAt"       DATETIME,
    "followUpAt"     DATETIME,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "Lead_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_branchId_fkey"    FOREIGN KEY ("branchId")    REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_clientId_fkey"    FOREIGN KEY ("clientId")    REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Lead_orgId_status_idx"  ON "Lead"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Lead_assignedToId_idx"  ON "Lead"("assignedToId");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx"     ON "Lead"("createdAt");

CREATE TABLE IF NOT EXISTS "LeadActivity" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "leadId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "note"      TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_createdAt_idx"  ON "LeadActivity"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadActivity_userId_createdAt_idx"  ON "LeadActivity"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "Quotation" (
    "id"             TEXT  NOT NULL PRIMARY KEY,
    "orgId"          TEXT,
    "quoteNumber"    TEXT  NOT NULL,
    "status"         TEXT  NOT NULL DEFAULT 'DRAFT',
    "currency"       TEXT  NOT NULL DEFAULT 'UGX',
    "leadId"         TEXT,
    "clientId"       TEXT,
    "jobId"          TEXT,
    "subtotal"       REAL  NOT NULL DEFAULT 0,
    "discountAmount" REAL  NOT NULL DEFAULT 0,
    "vatAmount"      REAL  NOT NULL DEFAULT 0,
    "totalAmount"    REAL  NOT NULL DEFAULT 0,
    "notes"          TEXT,
    "validUntil"     DATETIME,
    "sentAt"         DATETIME,
    "acceptedAt"     DATETIME,
    "rejectedAt"     DATETIME,
    "createdById"    TEXT,
    "approvedById"   TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "Quotation_orgId_fkey"       FOREIGN KEY ("orgId")       REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_leadId_fkey"      FOREIGN KEY ("leadId")      REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_clientId_fkey"    FOREIGN KEY ("clientId")    REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_jobId_fkey"       FOREIGN KEY ("jobId")       REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_quoteNumber_key"   ON "Quotation"("quoteNumber");
CREATE INDEX IF NOT EXISTS "Quotation_orgId_status_idx"         ON "Quotation"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Quotation_leadId_idx"               ON "Quotation"("leadId");
CREATE INDEX IF NOT EXISTS "Quotation_clientId_idx"             ON "Quotation"("clientId");
CREATE INDEX IF NOT EXISTS "Quotation_jobId_idx"                ON "Quotation"("jobId");

CREATE TABLE IF NOT EXISTS "QuotationItem" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "quotationId" TEXT    NOT NULL,
    "partId"      TEXT,
    "description" TEXT    NOT NULL,
    "quantity"    INTEGER NOT NULL,
    "unitPrice"   REAL    NOT NULL,
    "discount"    REAL    NOT NULL DEFAULT 0,
    "lineTotal"   REAL    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationItem_partId_fkey"       FOREIGN KEY ("partId")      REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");
CREATE INDEX IF NOT EXISTS "QuotationItem_partId_idx"      ON "QuotationItem"("partId");

-- ── 19. FIELD VISITS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "FieldVisit" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "orgId"         TEXT,
    "branchId"      TEXT,
    "jobId"         TEXT,
    "assignedToId"  TEXT NOT NULL,
    "scheduledById" TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt"   DATETIME NOT NULL,
    "startedAt"     DATETIME,
    "arrivedAt"     DATETIME,
    "completedAt"   DATETIME,
    "address"       TEXT NOT NULL,
    "gpsLat"        REAL,
    "gpsLng"        REAL,
    "contactName"   TEXT,
    "contactPhone"  TEXT,
    "notes"         TEXT,
    "outcomeNotes"  TEXT,
    "signoffName"   TEXT,
    "signoffAt"     DATETIME,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "FieldVisit_orgId_fkey"         FOREIGN KEY ("orgId")         REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_branchId_fkey"      FOREIGN KEY ("branchId")      REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_jobId_fkey"         FOREIGN KEY ("jobId")         REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_assignedToId_fkey"  FOREIGN KEY ("assignedToId")  REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FieldVisit_orgId_status_idx"           ON "FieldVisit"("orgId", "status");
CREATE INDEX IF NOT EXISTS "FieldVisit_assignedToId_scheduledAt_idx" ON "FieldVisit"("assignedToId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "FieldVisit_jobId_idx"                  ON "FieldVisit"("jobId");
CREATE INDEX IF NOT EXISTS "FieldVisit_branchId_idx"               ON "FieldVisit"("branchId");

-- ── 20. JOB QUALITY & WARRANTY ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "JobAssignmentHistory" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "jobId"          TEXT NOT NULL,
    "assignedToId"   TEXT,
    "assignedById"   TEXT,
    "assignedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"           TEXT,
    CONSTRAINT "JobAssignmentHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobAssignmentHistory_jobId_idx"         ON "JobAssignmentHistory"("jobId");
CREATE INDEX IF NOT EXISTS "JobAssignmentHistory_assignedToId_idx"  ON "JobAssignmentHistory"("assignedToId");

CREATE TABLE IF NOT EXISTS "JobStatusHistory" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "jobId"       TEXT NOT NULL,
    "fromStatus"  TEXT,
    "toStatus"    TEXT NOT NULL,
    "changedById" TEXT,
    "note"        TEXT,
    "changedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobStatusHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobStatusHistory_jobId_changedAt_idx" ON "JobStatusHistory"("jobId", "changedAt");

CREATE TABLE IF NOT EXISTS "DiagnosisReport" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "jobId"       TEXT NOT NULL,
    "techId"      TEXT,
    "findings"    TEXT NOT NULL,
    "recommended" TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosisReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosisReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DiagnosisReport_orgId_jobId_createdAt_idx" ON "DiagnosisReport"("orgId", "jobId", "createdAt");

CREATE TABLE IF NOT EXISTS "RepairTask" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT NOT NULL,
    "jobId"        TEXT NOT NULL,
    "assignedToId" TEXT,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt"        DATETIME,
    "completedAt"  DATETIME,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "RepairTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepairTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RepairTask_orgId_jobId_status_idx"        ON "RepairTask"("orgId", "jobId", "status");
CREATE INDEX IF NOT EXISTS "RepairTask_assignedToId_status_dueAt_idx" ON "RepairTask"("assignedToId", "status", "dueAt");

CREATE TABLE IF NOT EXISTS "CustomerApproval" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT NOT NULL,
    "jobId"        TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt"  DATETIME,
    "channel"      TEXT,
    "note"         TEXT,
    "createdById"  TEXT,
    CONSTRAINT "CustomerApproval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerApproval_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerApproval_orgId_jobId_status_idx" ON "CustomerApproval"("orgId", "jobId", "status");
CREATE INDEX IF NOT EXISTS "CustomerApproval_orgId_requestedAt_idx"  ON "CustomerApproval"("orgId", "requestedAt");

CREATE TABLE IF NOT EXISTS "QualityCheck" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT NOT NULL,
    "jobId"        TEXT NOT NULL,
    "checkedById"  TEXT,
    "passed"       BOOLEAN NOT NULL DEFAULT false,
    "notes"        TEXT,
    "checkedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityCheck_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityCheck_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "QualityCheck_orgId_jobId_status_idx" ON "QualityCheck"("orgId", "jobId", "passed");

CREATE TABLE IF NOT EXISTS "WarrantyClaim" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "orgId"           TEXT NOT NULL,
    "originalJobId"   TEXT,
    "clientId"        TEXT,
    "status"          TEXT NOT NULL DEFAULT 'OPEN',
    "description"     TEXT NOT NULL,
    "resolutionNote"  TEXT,
    "openedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"        DATETIME,
    "createdById"     TEXT,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME NOT NULL,
    CONSTRAINT "WarrantyClaim_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WarrantyClaim_orgId_status_openedAt_idx" ON "WarrantyClaim"("orgId", "status", "openedAt");
CREATE INDEX IF NOT EXISTS "WarrantyClaim_originalJobId_idx"         ON "WarrantyClaim"("originalJobId");

-- ── 21. DEVICE & CLIENT ENRICHMENT ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DeviceSpecification" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "deviceId"  TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceSpecification_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceSpecification_deviceId_key_key" ON "DeviceSpecification"("deviceId", "key");
CREATE INDEX IF NOT EXISTS "DeviceSpecification_orgId_key_idx"            ON "DeviceSpecification"("orgId", "key");

CREATE TABLE IF NOT EXISTS "CustomerConsent" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "granted"     BOOLEAN NOT NULL DEFAULT true,
    "capturedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" TEXT,
    CONSTRAINT "CustomerConsent_orgId_fkey"    FOREIGN KEY ("orgId")    REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerConsent_orgId_clientId_consentType_idx" ON "CustomerConsent"("orgId", "clientId", "consentType");
CREATE INDEX IF NOT EXISTS "CustomerConsent_orgId_capturedAt_idx"            ON "CustomerConsent"("orgId", "capturedAt");

CREATE TABLE IF NOT EXISTS "ClientMergeRecord" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "orgId"          TEXT NOT NULL,
    "sourceClientId" TEXT NOT NULL,
    "targetClientId" TEXT NOT NULL,
    "mergedById"     TEXT,
    "mergedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"           TEXT,
    CONSTRAINT "ClientMergeRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClientMergeRecord_orgId_mergedAt_idx"    ON "ClientMergeRecord"("orgId", "mergedAt");
CREATE INDEX IF NOT EXISTS "ClientMergeRecord_sourceClientId_idx"    ON "ClientMergeRecord"("sourceClientId");
CREATE INDEX IF NOT EXISTS "ClientMergeRecord_targetClientId_idx"    ON "ClientMergeRecord"("targetClientId");

-- ── 22. SYSTEM AUDIT & ORG METRICS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SystemAuditEvent" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "orgId"        TEXT,
    "actorUserId"  TEXT,
    "action"       TEXT NOT NULL,
    "entityType"   TEXT,
    "entityId"     TEXT,
    "detail"       TEXT,
    "ipAddress"    TEXT,
    "userAgent"    TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SystemAuditEvent_orgId_createdAt_idx"          ON "SystemAuditEvent"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemAuditEvent_entityType_entityId_createdAt_idx" ON "SystemAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "SystemAuditEvent_actorUserId_createdAt_idx"    ON "SystemAuditEvent"("actorUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "OrgFeatureEntitlement" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "feature"   TEXT NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "OrgFeatureEntitlement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgFeatureEntitlement_orgId_feature_key" ON "OrgFeatureEntitlement"("orgId", "feature");

CREATE TABLE IF NOT EXISTS "OrgSubscriptionEvent" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "orgId"     TEXT NOT NULL,
    "event"     TEXT NOT NULL,
    "plan"      TEXT,
    "amount"    REAL,
    "currency"  TEXT,
    "detail"    TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgSubscriptionEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgSubscriptionEvent_orgId_createdAt_idx" ON "OrgSubscriptionEvent"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "OrgUsageSnapshot" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "period"      TEXT NOT NULL,
    "userCount"   INTEGER NOT NULL DEFAULT 0,
    "jobCount"    INTEGER NOT NULL DEFAULT 0,
    "partCount"   INTEGER NOT NULL DEFAULT 0,
    "smsCount"    INTEGER NOT NULL DEFAULT 0,
    "storageBytes" INTEGER NOT NULL DEFAULT 0,
    "snapshotAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgUsageSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgUsageSnapshot_orgId_period_idx" ON "OrgUsageSnapshot"("orgId", "period");

CREATE TABLE IF NOT EXISTS "OrgSecurityPolicy" (
    "id"                    TEXT NOT NULL PRIMARY KEY,
    "orgId"                 TEXT NOT NULL,
    "mfaRequired"           BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 480,
    "ipAllowlist"           TEXT,
    "updatedAt"             DATETIME NOT NULL,
    CONSTRAINT "OrgSecurityPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgSecurityPolicy_orgId_key" ON "OrgSecurityPolicy"("orgId");

-- ── 23. COMMUNICATION ENRICHMENT ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "CommunicationTemplateVersion" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "templateId"  TEXT NOT NULL,
    "version"     INTEGER NOT NULL,
    "subject"     TEXT,
    "body"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationTemplateVersion_orgId_fkey"      FOREIGN KEY ("orgId")      REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunicationTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CommunicationTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationTemplateVersion_templateId_version_key" ON "CommunicationTemplateVersion"("templateId", "version");
CREATE INDEX IF NOT EXISTS "CommunicationTemplateVersion_orgId_status_idx"              ON "CommunicationTemplateVersion"("orgId", "status");

CREATE TABLE IF NOT EXISTS "FileAsset" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orgId"       TEXT NOT NULL,
    "uploadedById" TEXT,
    "filename"    TEXT NOT NULL,
    "mimeType"    TEXT NOT NULL,
    "sizeBytes"   INTEGER NOT NULL,
    "url"         TEXT NOT NULL,
    "entityType"  TEXT,
    "entityId"    TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileAsset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FileAsset_orgId_entityType_entityId_idx" ON "FileAsset"("orgId", "entityType", "entityId");

-- ── 24. ORG MODULE GRANT ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "OrgModuleGrant" (
    "orgId"  TEXT NOT NULL,
    "module" TEXT NOT NULL,
    PRIMARY KEY ("orgId", "module"),
    CONSTRAINT "OrgModuleGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgModuleGrant_orgId_idx" ON "OrgModuleGrant"("orgId");

-- Note: column additions to existing tables (User.branchId, Job.branchId, etc.)
-- are handled by the individual migrations that precede this one in timestamp order.
-- This migration only creates NEW tables; it is intentionally free of ALTER TABLE.

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
