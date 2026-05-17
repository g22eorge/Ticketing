-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialOrImei" TEXT,
    "accessories" TEXT,
    "physicalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "unitCost" REAL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "unitCostSnapshot" REAL,
    "reservedById" TEXT,
    "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" DATETIME,
    "releasedAt" DATETIME,
    "note" TEXT,
    CONSTRAINT "PartReservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartReservation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartReservation_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartStockTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "jobId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartStockTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartStockTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartStockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OneTimeExternalTechAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialization" TEXT,
    "agreedRepairCost" REAL,
    "partsNotes" TEXT,
    "expectedPartsCost" REAL,
    "assignedAt" DATETIME NOT NULL,
    "expectedReturnAt" DATETIME,
    "returnedAt" DATETIME,
    "instructions" TEXT,
    "progressNotes" TEXT,
    "finalOutcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OneTimeExternalTechAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "jobId" TEXT,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'DASHBOARD',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "notifyStatusChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyApprovalNeeded" BOOLEAN NOT NULL DEFAULT true,
    "notifyJobAssigned" BOOLEAN NOT NULL DEFAULT true,
    "notifyEstimateSubmitted" BOOLEAN NOT NULL DEFAULT true,
    "notifyPaymentReceived" BOOLEAN NOT NULL DEFAULT true,
    "notifyPayoutGenerated" BOOLEAN NOT NULL DEFAULT true,
    "notifyTimelineUpdated" BOOLEAN NOT NULL DEFAULT true,
    "notifyDelayNote" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairRequestSequence" (
    "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentBrandingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "companyName" TEXT NOT NULL DEFAULT 'Eagle Info Solutions',
    "companyTagline" TEXT,
    "companyAddressLine1" TEXT NOT NULL DEFAULT 'Nalubega Complex, 1st Floor',
    "companyAddressLine2" TEXT NOT NULL DEFAULT 'Shop L28, Bombo Road Opposite Watoto Church',
    "companyContacts" TEXT NOT NULL DEFAULT '+256772 006 344 | +256754 006 344',
    "companyEmail" TEXT,
    "companyWebsite" TEXT,
    "documentTitle" TEXT NOT NULL DEFAULT 'Job Card',
    "quotePrefix" TEXT NOT NULL DEFAULT 'EIS',
    "quoteFormat" TEXT NOT NULL DEFAULT '{PREFIX} {M}/{YYYY}/{SEQ}',
    "quoteValidityDays" INTEGER NOT NULL DEFAULT 30,
    "sequencePadLength" INTEGER NOT NULL DEFAULT 4,
    "vatDefaultApplicable" BOOLEAN NOT NULL DEFAULT true,
    "vatRatePercent" REAL NOT NULL DEFAULT 18,
    "vatLabel" TEXT NOT NULL DEFAULT 'VAT',
    "termsText" TEXT NOT NULL DEFAULT 'Quotation valid for 30 days from date issued.
Repair work begins only after approval is recorded.
Parts availability may affect final timeline.
Hidden pre-existing faults may affect final outcome.
Uncollected devices may attract storage fees after notice.',
    "footerText" TEXT NOT NULL DEFAULT 'System built by Almeida @ 2026 all rights reserved.',
    "signatureCompanyLabel" TEXT NOT NULL DEFAULT 'Signed by: Eagle Info Solutions',
    "signatureClientLabel" TEXT NOT NULL DEFAULT 'Signed by: Client',
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "secondaryColor" TEXT NOT NULL DEFAULT '#D4AF37',
    "accentColor" TEXT NOT NULL DEFAULT '#D4AF37',
    "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "surfaceColor" TEXT NOT NULL DEFAULT '#F5F5F5',
    "borderColor" TEXT NOT NULL DEFAULT '#E5E5E5',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentBrandingSettings" ("companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "quoteFormat", "quotePrefix", "quoteValidityDays", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent") SELECT "companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "quoteFormat", "quotePrefix", "quoteValidityDays", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent" FROM "DocumentBrandingSettings";
DROP TABLE "DocumentBrandingSettings";
ALTER TABLE "new_DocumentBrandingSettings" RENAME TO "DocumentBrandingSettings";
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "repairPath" TEXT,
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
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_externalPaidById_fkey" FOREIGN KEY ("externalPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_clientPaidById_fkey" FOREIGN KEY ("clientPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientConversationNote", "clientId", "closedAt", "communicationStatus", "completedAt", "costEstimate", "createdById", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "issueDescription", "jobNumber", "lastClientContactAt", "model", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendationOption", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "status", "statusNote", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "vatApplicable", "workDone", "workflowReason") SELECT "accessories", "approvalDate", "assignedToId", "brand", "clientApproved", "clientConversationNote", "clientId", "closedAt", "communicationStatus", "completedAt", "costEstimate", "createdById", "deviceType", "diagnosisNotes", "externalDiagnosis", "externalPaid", "externalPaidAt", "externalPaidById", "externalPaymentRef", "externalTechFee", "finalCost", "id", "issueDescription", "jobNumber", "lastClientContactAt", "model", "partsNeeded", "partsReplaced", "physicalNotes", "quotedAt", "receivedAt", "recommendationOption", "recommendedRepair", "repairPath", "repairTimeline", "serialOrImei", "status", "statusNote", "technicianNotes", "timelineConfidence", "timelineMaxMinutes", "timelineMinMinutes", "timelineNote", "updatedAt", "vatApplicable", "workDone", "workflowReason" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");
CREATE UNIQUE INDEX "Job_invoiceNumber_key" ON "Job"("invoiceNumber");
CREATE INDEX "Job_deviceId_idx" ON "Job"("deviceId");
CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");
CREATE INDEX "Job_status_receivedAt_idx" ON "Job"("status", "receivedAt");
CREATE INDEX "Job_assignedToId_status_idx" ON "Job"("assignedToId", "status");
CREATE INDEX "Job_completedAt_idx" ON "Job"("completedAt");
CREATE INDEX "Job_repairPath_idx" ON "Job"("repairPath");
CREATE TABLE "new_RepairRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestNumber" TEXT NOT NULL,
    "requestStatus" TEXT NOT NULL DEFAULT 'PENDING_FRONT_DESK',
    "handoverStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferredContactMethod" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "problemDescription" TEXT NOT NULL,
    "handoverMethod" TEXT NOT NULL,
    "preferredDropoffDate" TEXT,
    "preferredDropoffTime" TEXT,
    "dropoffNotes" TEXT,
    "deliveryPersonName" TEXT,
    "deliveryPersonPhone" TEXT,
    "deliveryCompany" TEXT,
    "dispatchDate" TEXT,
    "expectedArrivalTime" TEXT,
    "deliveryTrackingReference" TEXT,
    "deliveryFeeResponsibility" TEXT,
    "deliveryNotes" TEXT,
    "pickupAddress" TEXT,
    "pickupLandmark" TEXT,
    "preferredPickupDate" TEXT,
    "preferredPickupTime" TEXT,
    "alternateContactPerson" TEXT,
    "alternateContactPhone" TEXT,
    "pickupNotes" TEXT,
    "linkedJobId" TEXT,
    "submissionIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RepairRequest" ("alternateContactPerson", "alternateContactPhone", "brand", "createdAt", "customerName", "deliveryCompany", "deliveryFeeResponsibility", "deliveryNotes", "deliveryPersonName", "deliveryPersonPhone", "deliveryTrackingReference", "deviceType", "dispatchDate", "dropoffNotes", "email", "expectedArrivalTime", "handoverMethod", "handoverStatus", "id", "linkedJobId", "model", "phone", "pickupAddress", "pickupLandmark", "pickupNotes", "preferredContactMethod", "preferredDropoffDate", "preferredDropoffTime", "preferredPickupDate", "preferredPickupTime", "problemDescription", "requestNumber", "requestStatus", "serialNumber", "submissionIp", "updatedAt") SELECT "alternateContactPerson", "alternateContactPhone", "brand", "createdAt", "customerName", "deliveryCompany", "deliveryFeeResponsibility", "deliveryNotes", "deliveryPersonName", "deliveryPersonPhone", "deliveryTrackingReference", "deviceType", "dispatchDate", "dropoffNotes", "email", "expectedArrivalTime", "handoverMethod", "handoverStatus", "id", "linkedJobId", "model", "phone", "pickupAddress", "pickupLandmark", "pickupNotes", "preferredContactMethod", "preferredDropoffDate", "preferredDropoffTime", "preferredPickupDate", "preferredPickupTime", "problemDescription", "requestNumber", "requestStatus", "serialNumber", "submissionIp", "updatedAt" FROM "RepairRequest";
DROP TABLE "RepairRequest";
ALTER TABLE "new_RepairRequest" RENAME TO "RepairRequest";
CREATE UNIQUE INDEX "RepairRequest_requestNumber_key" ON "RepairRequest"("requestNumber");
CREATE INDEX "RepairRequest_requestStatus_createdAt_idx" ON "RepairRequest"("requestStatus", "createdAt");
CREATE INDEX "RepairRequest_phone_idx" ON "RepairRequest"("phone");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "departmentId" TEXT,
    "techType" TEXT,
    "employeeId" TEXT,
    "specializations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "phone", "role", "updatedAt") SELECT "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "phone", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Device_clientId_idx" ON "Device"("clientId");

-- CreateIndex
CREATE INDEX "Device_serialOrImei_idx" ON "Device"("serialOrImei");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

-- CreateIndex
CREATE INDEX "Part_isActive_idx" ON "Part"("isActive");

-- CreateIndex
CREATE INDEX "PartReservation_jobId_status_idx" ON "PartReservation"("jobId", "status");

-- CreateIndex
CREATE INDEX "PartReservation_partId_status_idx" ON "PartReservation"("partId", "status");

-- CreateIndex
CREATE INDEX "PartStockTransaction_partId_createdAt_idx" ON "PartStockTransaction"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "PartStockTransaction_jobId_idx" ON "PartStockTransaction"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeExternalTechAssignment_jobId_key" ON "OneTimeExternalTechAssignment"("jobId");

-- CreateIndex
CREATE INDEX "OneTimeExternalTechAssignment_assignedAt_idx" ON "OneTimeExternalTechAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_jobId_idx" ON "Notification"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_jobId_createdAt_idx" ON "AuditLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Photo_jobId_uploadedAt_idx" ON "Photo"("jobId", "uploadedAt");
