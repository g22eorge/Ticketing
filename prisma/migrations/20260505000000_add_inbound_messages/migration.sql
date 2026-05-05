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
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_wamid_key" ON "InboundMessage"("wamid");

-- CreateIndex
CREATE INDEX "InboundMessage_from_timestamp_idx" ON "InboundMessage"("from", "timestamp");

-- CreateIndex
CREATE INDEX "InboundMessage_jobId_timestamp_idx" ON "InboundMessage"("jobId", "timestamp");

-- CreateIndex
CREATE INDEX "InboundMessage_clientId_isRead_idx" ON "InboundMessage"("clientId", "isRead");

-- CreateIndex
CREATE INDEX "InboundMessage_isRead_createdAt_idx" ON "InboundMessage"("isRead", "createdAt");
