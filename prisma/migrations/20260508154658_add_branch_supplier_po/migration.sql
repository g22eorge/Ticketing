-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "orderedAt" DATETIME,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCost" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "repairPath" TEXT,
    "orgId" TEXT,
    "branchId" TEXT,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialOrImei" TEXT,
    "accessories" TEXT,
    "physicalNotes" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'HARDWARE',
    "softwareOsInstall" BOOLEAN NOT NULL DEFAULT false,
    "softwareDriversUpdates" BOOLEAN NOT NULL DEFAULT false,
    "softwareDataBackupRestore" BOOLEAN NOT NULL DEFAULT false,
    "softwareAccountSetup" BOOLEAN NOT NULL DEFAULT false,
    "softwarePerformanceTune" BOOLEAN NOT NULL DEFAULT false,
    "softwareThirdPartyApps" BOOLEAN NOT NULL DEFAULT false,
    "softwareRequestedNotes" TEXT,
    "softwareLicenseAttested" BOOLEAN NOT NULL DEFAULT false,
    "softwareInstallerSource" TEXT,
    "softwareInstallerSourceNote" TEXT,
    "issueDescription" TEXT NOT NULL,
    "workflowReason" TEXT NOT NULL DEFAULT 'NONE',
    "statusNote" TEXT,
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
    "vatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "externalTechFee" REAL,
    "externalPaid" BOOLEAN NOT NULL DEFAULT false,
    "externalPaidAt" DATETIME,
    "externalPaidById" TEXT,
    "externalPaymentRef" TEXT,
    "clientPaid" BOOLEAN NOT NULL DEFAULT false,
    "clientPaidAt" DATETIME,
    "clientPaidById" TEXT,
    "clientPaymentRef" TEXT,
    "invoiceNumber" TEXT,
    "invoiceIssuedAt" DATETIME,
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
    "deliveredAt" DATETIME,
    "deliveryMethod" TEXT,
    "deliveredTo" TEXT,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_externalPaidById_fkey" FOREIGN KEY ("externalPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_clientPaidById_fkey" FOREIGN KEY ("clientPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientConversationNote", "clientId", "clientPaid", "clientPaidAt", "clientPaidById", "clientPaymentRef", "closedAt", "communicationStatus", "completedAt", "costEstimate", "createdById", "deliveredAt", "deliveredTo", "deliveryMethod", "deviceId", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "invoiceIssuedAt", "invoiceNumber", "issueDescription", "jobNumber", "lastClientContactAt", "model", "orgId", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendationOption", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "serviceType", "softwareAccountSetup", "softwareDataBackupRestore", "softwareDriversUpdates", "softwareInstallerSource", "softwareInstallerSourceNote", "softwareLicenseAttested", "softwareOsInstall", "softwarePerformanceTune", "softwareRequestedNotes", "softwareThirdPartyApps", "status", "statusNote", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "vatApplicable", "workDone", "workflowReason") SELECT "accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientConversationNote", "clientId", "clientPaid", "clientPaidAt", "clientPaidById", "clientPaymentRef", "closedAt", "communicationStatus", "completedAt", "costEstimate", "createdById", "deliveredAt", "deliveredTo", "deliveryMethod", "deviceId", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "invoiceIssuedAt", "invoiceNumber", "issueDescription", "jobNumber", "lastClientContactAt", "model", "orgId", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendationOption", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "serviceType", "softwareAccountSetup", "softwareDataBackupRestore", "softwareDriversUpdates", "softwareInstallerSource", "softwareInstallerSourceNote", "softwareLicenseAttested", "softwareOsInstall", "softwarePerformanceTune", "softwareRequestedNotes", "softwareThirdPartyApps", "status", "statusNote", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "vatApplicable", "workDone", "workflowReason" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");
CREATE UNIQUE INDEX "Job_invoiceNumber_key" ON "Job"("invoiceNumber");
CREATE INDEX "Job_orgId_idx" ON "Job"("orgId");
CREATE INDEX "Job_orgId_status_idx" ON "Job"("orgId", "status");
CREATE INDEX "Job_deviceId_idx" ON "Job"("deviceId");
CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");
CREATE INDEX "Job_status_receivedAt_idx" ON "Job"("status", "receivedAt");
CREATE INDEX "Job_assignedToId_status_idx" ON "Job"("assignedToId", "status");
CREATE INDEX "Job_completedAt_idx" ON "Job"("completedAt");
CREATE INDEX "Job_repairPath_idx" ON "Job"("repairPath");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orgId" TEXT,
    "branchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt") SELECT "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_orgId_idx" ON "User"("orgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Branch_orgId_idx" ON "Branch"("orgId");

-- CreateIndex
CREATE INDEX "Supplier_orgId_idx" ON "Supplier"("orgId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orgId_idx" ON "PurchaseOrder"("orgId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_poId_idx" ON "PurchaseOrderItem"("poId");
