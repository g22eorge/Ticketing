CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "locationId" TEXT NOT NULL,
    "countedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "approvedAt" DATETIME,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockCount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCountId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "varianceQty" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCountItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockCount_countNumber_key" ON "StockCount"("countNumber");
CREATE INDEX "StockCount_orgId_status_countedAt_idx" ON "StockCount"("orgId", "status", "countedAt");
CREATE INDEX "StockCount_locationId_idx" ON "StockCount"("locationId");
CREATE INDEX "StockCountItem_stockCountId_idx" ON "StockCountItem"("stockCountId");
CREATE INDEX "StockCountItem_partId_idx" ON "StockCountItem"("partId");
