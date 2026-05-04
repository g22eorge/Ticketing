-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "repairPath" TEXT,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialOrImei" TEXT,
    "accessories" TEXT,
    "physicalNotes" TEXT,
    "issueDescription" TEXT NOT NULL,
    "diagnosisNotes" TEXT,
    "externalDiagnosis" TEXT,
    "recommendedRepair" TEXT,
    "recommendationOption" TEXT,
    "communicationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "clientConversationNote" TEXT,
    "lastClientContactAt" DATETIME,
    "partsNeeded" TEXT,
    "costEstimate" REAL,
    "finalCost" REAL,
    "externalTechFee" REAL,
    "externalPaid" BOOLEAN NOT NULL DEFAULT false,
    "externalPaidAt" DATETIME,
    "externalPaidById" TEXT,
    "externalPaymentRef" TEXT,
    "clientApproved" BOOLEAN,
    "approvalDate" DATETIME,
    "quotedAt" DATETIME,
    "repairTimeline" TEXT,
    "timelineMinMinutes" INTEGER,
    "timelineMaxMinutes" INTEGER,
    "timelineConfidence" TEXT,
    "timelineNote" TEXT,
    "technicianNotes" TEXT,
    "workDone" TEXT,
    "partsReplaced" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_externalPaidById_fkey" FOREIGN KEY ("externalPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientId", "closedAt", "completedAt", "costEstimate", "createdById", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "issueDescription", "jobNumber", "model", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "status", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "workDone") SELECT "accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientId", "closedAt", "completedAt", "costEstimate", "createdById", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "issueDescription", "jobNumber", "model", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "status", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "workDone" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
