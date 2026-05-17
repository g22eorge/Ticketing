-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "entityType" TEXT NOT NULL,
    "userId" TEXT,
    "departmentId" TEXT,
    "branchId" TEXT,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "targetValue" REAL NOT NULL,
    "actualValue" REAL NOT NULL DEFAULT 0,
    "setById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesTarget_orgId_period_periodLabel_idx" ON "SalesTarget"("orgId", "period", "periodLabel");

-- CreateIndex
CREATE INDEX "SalesTarget_userId_metric_idx" ON "SalesTarget"("userId", "metric");

-- CreateIndex
CREATE INDEX "SalesTarget_departmentId_metric_idx" ON "SalesTarget"("departmentId", "metric");

-- CreateIndex
CREATE INDEX "SalesTarget_branchId_metric_idx" ON "SalesTarget"("branchId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_entityType_userId_departmentId_branchId_metric_period_periodLabel_key" ON "SalesTarget"("entityType", "userId", "departmentId", "branchId", "metric", "period", "periodLabel");
