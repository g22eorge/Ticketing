-- CreateTable
CREATE TABLE "CommunicationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CommunicationTemplate_channel_isActive_idx" ON "CommunicationTemplate"("channel", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplate_key_channel_key" ON "CommunicationTemplate"("key", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPolicy_status_key" ON "CommunicationPolicy"("status");

-- CreateIndex
CREATE INDEX "CommunicationPolicy_templateKey_idx" ON "CommunicationPolicy"("templateKey");
