-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "billingStatus" TEXT NOT NULL DEFAULT 'TRIALING',
    "flwCustomerId" TEXT,
    "flwSubscriptionId" TEXT,
    "flwPlanId" TEXT,
    "trialEndsAt" DATETIME,
    "planRenewsAt" DATETIME,
    "planCancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPS',
    "orgId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserAccessAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccessAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAccessAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "organization" TEXT,
    "notes" TEXT,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "orgId" TEXT,
    "deviceType" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialOrImei" TEXT,
    "accessories" TEXT,
    "physicalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "repairPath" TEXT,
    "orgId" TEXT,
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
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_externalPaidById_fkey" FOREIGN KEY ("externalPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_clientPaidById_fkey" FOREIGN KEY ("clientPaidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Part_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "templateKey" TEXT,
    "templateVars" TEXT,
    "metaTemplateName" TEXT,
    "metaTemplateLanguage" TEXT,
    "metaTemplateVars" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "providerDeliveryStatus" TEXT,
    "providerDeliveryAt" DATETIME,
    "providerDeliveryErrorCode" TEXT,
    "providerDeliveryError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "lockedAt" DATETIME,
    "repairRequestId" TEXT,
    "jobId" TEXT,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboundMessage_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "RepairRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE TABLE "CommunicationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT,
    "metaTemplateName" TEXT,
    "metaLanguageCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "dashboardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "templateKey" TEXT,
    "nudge1Hours" INTEGER,
    "nudge2Hours" INTEGER,
    "orgId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunicationPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentBrandingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentBrandingSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wamid" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT,
    "mediaType" TEXT,
    "mediaId" TEXT,
    "mediaCaption" TEXT,
    "timestamp" DATETIME NOT NULL,
    "clientId" TEXT,
    "jobId" TEXT,
    "orgId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestNumber" TEXT NOT NULL,
    "requestStatus" TEXT NOT NULL DEFAULT 'PENDING_FRONT_DESK',
    "handoverStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "orgId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairRequestSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RepairRequestSequence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_token_idx" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_orgId_idx" ON "UserInvite"("orgId");

-- CreateIndex
CREATE INDEX "UserInvite_email_orgId_idx" ON "UserInvite"("email", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "UserPermission_permission_idx" ON "UserPermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");

-- CreateIndex
CREATE INDEX "UserAccessAudit_targetUserId_createdAt_idx" ON "UserAccessAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserAccessAudit_actorUserId_createdAt_idx" ON "UserAccessAudit"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Client_orgId_idx" ON "Client"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_phone_orgId_key" ON "Client"("phone", "orgId");

-- CreateIndex
CREATE INDEX "Device_clientId_idx" ON "Device"("clientId");

-- CreateIndex
CREATE INDEX "Device_orgId_idx" ON "Device"("orgId");

-- CreateIndex
CREATE INDEX "Device_serialOrImei_idx" ON "Device"("serialOrImei");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Job_invoiceNumber_key" ON "Job"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Job_orgId_idx" ON "Job"("orgId");

-- CreateIndex
CREATE INDEX "Job_orgId_status_idx" ON "Job"("orgId", "status");

-- CreateIndex
CREATE INDEX "Job_deviceId_idx" ON "Job"("deviceId");

-- CreateIndex
CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");

-- CreateIndex
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");

-- CreateIndex
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Job_status_receivedAt_idx" ON "Job"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "Job_assignedToId_status_idx" ON "Job"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Job_completedAt_idx" ON "Job"("completedAt");

-- CreateIndex
CREATE INDEX "Job_repairPath_idx" ON "Job"("repairPath");

-- CreateIndex
CREATE INDEX "Part_orgId_isActive_idx" ON "Part"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_orgId_key" ON "Part"("sku", "orgId");

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
CREATE INDEX "Photo_jobId_uploadedAt_idx" ON "Photo"("jobId", "uploadedAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_jobId_createdAt_idx" ON "AuditLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_orgId_isRead_createdAt_idx" ON "Notification"("orgId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_jobId_idx" ON "Notification"("jobId");

-- CreateIndex
CREATE INDEX "OutboundMessage_orgId_channel_status_nextAttemptAt_idx" ON "OutboundMessage"("orgId", "channel", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_channel_status_nextAttemptAt_idx" ON "OutboundMessage"("channel", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_providerMessageId_idx" ON "OutboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_repairRequestId_idx" ON "OutboundMessage"("repairRequestId");

-- CreateIndex
CREATE INDEX "OutboundMessage_jobId_idx" ON "OutboundMessage"("jobId");

-- CreateIndex
CREATE INDEX "OutboundMessage_templateKey_idx" ON "OutboundMessage"("templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE INDEX "CommunicationTemplate_orgId_channel_isActive_idx" ON "CommunicationTemplate"("orgId", "channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_key_channel_orgId_key" ON "CommunicationTemplate"("key", "channel", "orgId");

-- CreateIndex
CREATE INDEX "CommunicationPolicy_orgId_templateKey_idx" ON "CommunicationPolicy"("orgId", "templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPolicy_status_orgId_key" ON "CommunicationPolicy"("status", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentBrandingSettings_orgId_key" ON "DocumentBrandingSettings"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_wamid_key" ON "InboundMessage"("wamid");

-- CreateIndex
CREATE INDEX "InboundMessage_orgId_isRead_createdAt_idx" ON "InboundMessage"("orgId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_from_timestamp_idx" ON "InboundMessage"("from", "timestamp");

-- CreateIndex
CREATE INDEX "InboundMessage_jobId_timestamp_idx" ON "InboundMessage"("jobId", "timestamp");

-- CreateIndex
CREATE INDEX "InboundMessage_clientId_isRead_idx" ON "InboundMessage"("clientId", "isRead");

-- CreateIndex
CREATE INDEX "InboundMessage_isRead_createdAt_idx" ON "InboundMessage"("isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_requestNumber_key" ON "RepairRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "RepairRequest_requestStatus_createdAt_idx" ON "RepairRequest"("requestStatus", "createdAt");

-- CreateIndex
CREATE INDEX "RepairRequest_phone_idx" ON "RepairRequest"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequestSequence_orgId_year_key" ON "RepairRequestSequence"("orgId", "year");

