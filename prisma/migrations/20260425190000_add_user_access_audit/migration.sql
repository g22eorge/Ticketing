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

-- CreateIndex
CREATE INDEX "UserAccessAudit_targetUserId_createdAt_idx" ON "UserAccessAudit"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UserAccessAudit_actorUserId_createdAt_idx" ON "UserAccessAudit"("actorUserId", "createdAt");
