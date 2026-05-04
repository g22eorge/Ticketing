-- Add Meta/WhatsApp approved template fields to CommunicationTemplate
ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaTemplateName" TEXT;
ALTER TABLE "CommunicationTemplate" ADD COLUMN "metaLanguageCode" TEXT;

-- CreateTable OutboundMessage (was previously created only via db push, not in any migration)
-- CREATE TABLE IF NOT EXISTS is a no-op on databases where it already exists.
CREATE TABLE IF NOT EXISTS "OutboundMessage" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboundMessage_repairRequestId_fkey" FOREIGN KEY ("repairRequestId") REFERENCES "RepairRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex (IF NOT EXISTS so safe to run on DBs that already have these)
CREATE INDEX IF NOT EXISTS "OutboundMessage_channel_status_nextAttemptAt_idx" ON "OutboundMessage"("channel", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "OutboundMessage_providerMessageId_idx" ON "OutboundMessage"("providerMessageId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_repairRequestId_idx" ON "OutboundMessage"("repairRequestId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_jobId_idx" ON "OutboundMessage"("jobId");
CREATE INDEX IF NOT EXISTS "OutboundMessage_templateKey_idx" ON "OutboundMessage"("templateKey");
