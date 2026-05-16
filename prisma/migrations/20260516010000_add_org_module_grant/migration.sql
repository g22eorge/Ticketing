-- CreateTable
CREATE TABLE "OrgModuleGrant" (
    "orgId" TEXT NOT NULL,
    "module" TEXT NOT NULL,

    PRIMARY KEY ("orgId", "module"),
    CONSTRAINT "OrgModuleGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrgModuleGrant_orgId_idx" ON "OrgModuleGrant"("orgId");
