CREATE TABLE "GoodsReceived" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "supplierId" TEXT NOT NULL,
    "poId" TEXT,
    "locationId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoodsReceived_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceived_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "GoodsReceivedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grnId" TEXT NOT NULL,
    "poItemId" TEXT,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsReceivedItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceived" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceivedItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GoodsReceived_grnNumber_key" ON "GoodsReceived"("grnNumber");
CREATE INDEX "GoodsReceived_orgId_receivedAt_idx" ON "GoodsReceived"("orgId", "receivedAt");
CREATE INDEX "GoodsReceived_supplierId_idx" ON "GoodsReceived"("supplierId");
CREATE INDEX "GoodsReceived_poId_idx" ON "GoodsReceived"("poId");
CREATE INDEX "GoodsReceived_locationId_idx" ON "GoodsReceived"("locationId");
CREATE INDEX "GoodsReceivedItem_grnId_idx" ON "GoodsReceivedItem"("grnId");
CREATE INDEX "GoodsReceivedItem_partId_idx" ON "GoodsReceivedItem"("partId");
CREATE INDEX "GoodsReceivedItem_poItemId_idx" ON "GoodsReceivedItem"("poItemId");
