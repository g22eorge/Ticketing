ALTER TABLE "Payment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PAYMENT';

CREATE TABLE IF NOT EXISTS "TechnicianPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "note" TEXT,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TechnicianPayout_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TechnicianPayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TechnicianPayout_orgId_paidAt_idx" ON "TechnicianPayout"("orgId", "paidAt");
CREATE INDEX IF NOT EXISTS "TechnicianPayout_jobId_idx" ON "TechnicianPayout"("jobId");
