-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "organization" TEXT,
    "interest" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WALK_IN',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimatedValue" REAL,
    "notes" TEXT,
    "clientId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "convertedAt" DATETIME,
    "closedAt" DATETIME,
    "followUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "quoteNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "leadId" TEXT,
    "clientId" TEXT,
    "jobId" TEXT,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "vatAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "validUntil" DATETIME,
    "sentAt" DATETIME,
    "acceptedAt" DATETIME,
    "rejectedAt" DATETIME,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PosSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "branchId" TEXT,
    "operatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingFloat" REAL NOT NULL DEFAULT 0,
    "closingCash" REAL,
    "cashTotal" REAL NOT NULL DEFAULT 0,
    "cardTotal" REAL NOT NULL DEFAULT 0,
    "mobileTotal" REAL NOT NULL DEFAULT 0,
    "totalSales" REAL NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "actualClosingBalance" REAL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "PosSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "branchId" TEXT,
    "jobId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "scheduledById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "arrivedAt" DATETIME,
    "completedAt" DATETIME,
    "address" TEXT NOT NULL,
    "gpsLat" REAL,
    "gpsLng" REAL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "outcomeNotes" TEXT,
    "signoffName" TEXT,
    "signoffAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FieldVisit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldVisit_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PartLocationStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartLocationStock_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PartLocationStock" ("id", "locationId", "orgId", "partId", "qtyOnHand", "qtyReserved", "updatedAt") SELECT "id", "locationId", "orgId", "partId", "qtyOnHand", "qtyReserved", "updatedAt" FROM "PartLocationStock";
DROP TABLE "PartLocationStock";
ALTER TABLE "new_PartLocationStock" RENAME TO "PartLocationStock";
CREATE INDEX "PartLocationStock_orgId_locationId_idx" ON "PartLocationStock"("orgId", "locationId");
CREATE INDEX "PartLocationStock_partId_idx" ON "PartLocationStock"("partId");
CREATE UNIQUE INDEX "PartLocationStock_partId_locationId_key" ON "PartLocationStock"("partId", "locationId");
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "clientId" TEXT,
    "posSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "saleNumber" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL DEFAULT 'CASH',
    "invoiceNumber" TEXT,
    "invoicedAt" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "vatAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_posSessionId_fkey" FOREIGN KEY ("posSessionId") REFERENCES "PosSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("billingMode", "branchId", "clientId", "createdAt", "createdById", "currency", "discountAmount", "id", "invoiceNumber", "invoicedAt", "notes", "orgId", "paidAmount", "paidAt", "saleNumber", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount") SELECT "billingMode", "branchId", "clientId", "createdAt", "createdById", "currency", "discountAmount", "id", "invoiceNumber", "invoicedAt", "notes", "orgId", "paidAmount", "paidAt", "saleNumber", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");
CREATE INDEX "Sale_orgId_createdAt_idx" ON "Sale"("orgId", "createdAt");
CREATE INDEX "Sale_orgId_status_idx" ON "Sale"("orgId", "status");
CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");
CREATE INDEX "Sale_posSessionId_idx" ON "Sale"("posSessionId");
CREATE TABLE "new_SalesTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "departmentId" TEXT,
    "branchId" TEXT,
    "setById" TEXT,
    "entityType" TEXT NOT NULL DEFAULT 'COMPANY',
    "metric" TEXT NOT NULL DEFAULT 'REVENUE',
    "period" TEXT NOT NULL,
    "periodLabel" TEXT,
    "targetRevenue" REAL NOT NULL DEFAULT 0,
    "targetJobs" INTEGER NOT NULL DEFAULT 0,
    "targetValue" REAL NOT NULL DEFAULT 0,
    "actualValue" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesTarget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesTarget" ("createdAt", "id", "notes", "orgId", "period", "targetJobs", "targetRevenue", "updatedAt", "userId") SELECT "createdAt", "id", "notes", "orgId", "period", "targetJobs", "targetRevenue", "updatedAt", "userId" FROM "SalesTarget";
DROP TABLE "SalesTarget";
ALTER TABLE "new_SalesTarget" RENAME TO "SalesTarget";
CREATE INDEX "SalesTarget_orgId_period_idx" ON "SalesTarget"("orgId", "period");
CREATE INDEX "SalesTarget_entityType_period_periodLabel_idx" ON "SalesTarget"("entityType", "period", "periodLabel");
CREATE INDEX "SalesTarget_userId_idx" ON "SalesTarget"("userId");
CREATE INDEX "SalesTarget_departmentId_idx" ON "SalesTarget"("departmentId");
CREATE INDEX "SalesTarget_branchId_idx" ON "SalesTarget"("branchId");
CREATE UNIQUE INDEX "SalesTarget_orgId_userId_period_key" ON "SalesTarget"("orgId", "userId", "period");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OPS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessMode" TEXT NOT NULL DEFAULT 'FULL',
    "orgId" TEXT,
    "branchId" TEXT,
    "departmentId" TEXT,
    "techType" TEXT,
    "employeeId" TEXT,
    "specializations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accessMode", "branchId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt") SELECT "accessMode", "branchId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_orgId_idx" ON "User"("orgId");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Lead_orgId_status_idx" ON "Lead"("orgId", "status");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_userId_createdAt_idx" ON "LeadActivity"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quotation_orgId_status_idx" ON "Quotation"("orgId", "status");

-- CreateIndex
CREATE INDEX "Quotation_leadId_idx" ON "Quotation"("leadId");

-- CreateIndex
CREATE INDEX "Quotation_clientId_idx" ON "Quotation"("clientId");

-- CreateIndex
CREATE INDEX "Quotation_jobId_idx" ON "Quotation"("jobId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_partId_idx" ON "QuotationItem"("partId");

-- CreateIndex
CREATE INDEX "PosSession_orgId_status_idx" ON "PosSession"("orgId", "status");

-- CreateIndex
CREATE INDEX "PosSession_operatorId_openedAt_idx" ON "PosSession"("operatorId", "openedAt");

-- CreateIndex
CREATE INDEX "PosSession_branchId_idx" ON "PosSession"("branchId");

-- CreateIndex
CREATE INDEX "FieldVisit_orgId_status_idx" ON "FieldVisit"("orgId", "status");

-- CreateIndex
CREATE INDEX "FieldVisit_assignedToId_scheduledAt_idx" ON "FieldVisit"("assignedToId", "scheduledAt");

-- CreateIndex
CREATE INDEX "FieldVisit_jobId_idx" ON "FieldVisit"("jobId");

-- CreateIndex
CREATE INDEX "FieldVisit_branchId_idx" ON "FieldVisit"("branchId");

