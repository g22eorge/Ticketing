-- CreateTable
CREATE TABLE "FieldVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "branchId" TEXT,
    "jobId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "scheduledById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "address" TEXT NOT NULL,
    "gpsLat" REAL,
    "gpsLng" REAL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "outcomeNotes" TEXT,
    "signoffName" TEXT,
    "signoffAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FieldVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FieldVisit_orgId_status_idx" ON "FieldVisit"("orgId", "status");

-- CreateIndex
CREATE INDEX "FieldVisit_assignedToId_scheduledAt_idx" ON "FieldVisit"("assignedToId", "scheduledAt");

-- CreateIndex
CREATE INDEX "FieldVisit_jobId_idx" ON "FieldVisit"("jobId");
