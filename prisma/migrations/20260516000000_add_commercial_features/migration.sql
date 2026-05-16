
-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGroupPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "saleId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRateToBase" REAL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "saleId" TEXT,
    "invoiceId" TEXT,
    "creditNoteId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "exchangeRateToBase" REAL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "refundedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "totalAmount" REAL NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "itemsReceivedBackAt" DATETIME,
    "itemsReceivedBackById" TEXT,
    "itemsReceivedBackNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_itemsReceivedBackById_fkey" FOREIGN KEY ("itemsReceivedBackById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditNoteId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditNoteItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "clientId" TEXT,
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
    CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "saleId" TEXT,
    "invoiceId" TEXT,
    "deliveryNoteNumber" TEXT NOT NULL,
    "deliveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryMethod" TEXT,
    "deliveredByName" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "receivedBySignatureText" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryNoteId" TEXT NOT NULL,
    "saleItemId" TEXT,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNoteItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNoteItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "lineTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrgFeatureEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limitValue" REAL,
    "metadataJson" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrgSubscriptionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "plan" TEXT,
    "status" TEXT,
    "amount" REAL,
    "currency" TEXT,
    "payloadJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrgUsageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT
);

-- CreateTable
CREATE TABLE "OrgSecurityPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "requireMfa" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutMinutes" INTEGER,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "allowedIpRanges" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BranchOperatingHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BranchNumberingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "jobPrefix" TEXT,
    "invoicePrefix" TEXT,
    "receiptPrefix" TEXT,
    "quotationPrefix" TEXT,
    "salePrefix" TEXT,
    "nextJobSequence" INTEGER NOT NULL DEFAULT 1,
    "nextSaleSequence" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "channel" TEXT,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "ClientMergeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "sourceClientId" TEXT NOT NULL,
    "targetClientId" TEXT NOT NULL,
    "mergedById" TEXT NOT NULL,
    "reason" TEXT,
    "snapshotJson" TEXT,
    "mergedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeviceSpecification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobAssignmentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedById" TEXT,
    "assignmentType" TEXT NOT NULL DEFAULT 'PRIMARY',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "JobStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT
);

-- CreateTable
CREATE TABLE "DiagnosisReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "summary" TEXT NOT NULL,
    "findings" TEXT,
    "recommendedWork" TEXT,
    "riskNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepairTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" REAL,
    "currency" TEXT,
    "requestedById" TEXT,
    "respondedByName" TEXT,
    "responseNote" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "checkedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checklistJson" TEXT,
    "notes" TEXT,
    "checkedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "originalJobId" TEXT NOT NULL,
    "warrantyJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartLocationStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "qtyReserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "partId" TEXT,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "unitCost" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "minQuantity" INTEGER,
    "leadTimeDays" INTEGER,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReorderRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "locationId" TEXT,
    "minQty" INTEGER NOT NULL DEFAULT 0,
    "targetQty" INTEGER NOT NULL DEFAULT 0,
    "preferredSupplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DocumentTaxLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "taxRate" REAL NOT NULL,
    "taxableAmount" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT,
    "saleId" TEXT,
    "invoiceId" TEXT,
    "branchId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "voidedAt" DATETIME,
    "voidReason" TEXT
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "CashierShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "cashierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingCash" REAL NOT NULL DEFAULT 0,
    "closingCash" REAL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "clientId" TEXT,
    "jobId" TEXT,
    "repairRequestId" TEXT,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sender" TEXT,
    "recipient" TEXT,
    "body" TEXT,
    "outboundMessageId" TEXT,
    "inboundMessageId" TEXT,
    "providerMessageId" TEXT,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CommunicationTemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT,
    "approvedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "label" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "uploadedById" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "complaintNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "jobId" TEXT,
    "saleId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT,
    "description" TEXT NOT NULL,
    "expectedResolution" TEXT,
    "assignedToId" TEXT,
    "internalNotes" TEXT,
    "resolution" TEXT,
    "acknowledgedAt" DATETIME,
    "investigatingAt" DATETIME,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "satisfactionRating" INTEGER,
    "satisfactionComment" TEXT,
    "ratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Complaint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Complaint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "period" TEXT NOT NULL,
    "targetRevenue" REAL NOT NULL DEFAULT 0,
    "targetJobs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesTarget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentBrandingSettings" (
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
    "invoiceTemplateKey" TEXT NOT NULL DEFAULT 'invoice_classic',
    "quotationTemplateKey" TEXT NOT NULL DEFAULT 'quote_classic',
    "jobCardTemplateKey" TEXT NOT NULL DEFAULT 'job_card_classic',
    "receiptTemplateKey" TEXT NOT NULL DEFAULT 'receipt_classic',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentBrandingSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DocumentBrandingSettings" ("accentColor", "backgroundColor", "borderColor", "companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "orgId", "primaryColor", "quoteFormat", "quotePrefix", "quoteValidityDays", "secondaryColor", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "surfaceColor", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent") SELECT "accentColor", "backgroundColor", "borderColor", "companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "orgId", "primaryColor", "quoteFormat", "quotePrefix", "quoteValidityDays", "secondaryColor", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "surfaceColor", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent" FROM "DocumentBrandingSettings";
DROP TABLE "DocumentBrandingSettings";
ALTER TABLE "new_DocumentBrandingSettings" RENAME TO "DocumentBrandingSettings";
CREATE UNIQUE INDEX "DocumentBrandingSettings_orgId_key" ON "DocumentBrandingSettings"("orgId");
CREATE TABLE "new_Organization" (
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
    "baseCurrency" TEXT NOT NULL DEFAULT 'UGX',
    "supportedCurrencies" TEXT NOT NULL DEFAULT 'UGX',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organization" ("billingStatus", "createdAt", "flwCustomerId", "flwPlanId", "flwSubscriptionId", "id", "isActive", "name", "plan", "planCancelledAt", "planRenewsAt", "slug", "trialEndsAt", "updatedAt") SELECT "billingStatus", "createdAt", "flwCustomerId", "flwPlanId", "flwSubscriptionId", "id", "isActive", "name", "plan", "planCancelledAt", "planRenewsAt", "slug", "trialEndsAt", "updatedAt" FROM "Organization";
DROP TABLE "Organization";
ALTER TABLE "new_Organization" RENAME TO "Organization";
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");
CREATE TABLE "new_PartStockTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "jobId" TEXT,
    "saleId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartStockTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartStockTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartStockTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartStockTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PartStockTransaction" ("createdAt", "createdById", "id", "jobId", "partId", "quantity", "reason", "type") SELECT "createdAt", "createdById", "id", "jobId", "partId", "quantity", "reason", "type" FROM "PartStockTransaction";
DROP TABLE "PartStockTransaction";
ALTER TABLE "new_PartStockTransaction" RENAME TO "PartStockTransaction";
CREATE INDEX "PartStockTransaction_partId_createdAt_idx" ON "PartStockTransaction"("partId", "createdAt");
CREATE INDEX "PartStockTransaction_jobId_idx" ON "PartStockTransaction"("jobId");
CREATE INDEX "PartStockTransaction_saleId_idx" ON "PartStockTransaction"("saleId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("branchId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt") SELECT "branchId", "createdAt", "email", "emailVerified", "id", "image", "isActive", "name", "orgId", "phone", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_orgId_idx" ON "User"("orgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserGroup_orgId_createdAt_idx" ON "UserGroup"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_orgId_name_key" ON "UserGroup"("orgId", "name");

-- CreateIndex
CREATE INDEX "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupMember_groupId_userId_key" ON "UserGroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "UserGroupPermission_permission_idx" ON "UserGroupPermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupPermission_groupId_permission_key" ON "UserGroupPermission"("groupId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_jobId_key" ON "Invoice"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_orgId_issuedAt_idx" ON "Invoice"("orgId", "issuedAt");

-- CreateIndex
CREATE INDEX "Invoice_orgId_status_idx" ON "Invoice"("orgId", "status");

-- CreateIndex
CREATE INDEX "Payment_orgId_receivedAt_idx" ON "Payment"("orgId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE INDEX "Refund_orgId_refundedAt_idx" ON "Refund"("orgId", "refundedAt");

-- CreateIndex
CREATE INDEX "Refund_saleId_idx" ON "Refund"("saleId");

-- CreateIndex
CREATE INDEX "Refund_invoiceId_idx" ON "Refund"("invoiceId");

-- CreateIndex
CREATE INDEX "Refund_creditNoteId_idx" ON "Refund"("creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "CreditNote_orgId_issuedAt_idx" ON "CreditNote"("orgId", "issuedAt");

-- CreateIndex
CREATE INDEX "CreditNote_saleId_idx" ON "CreditNote"("saleId");

-- CreateIndex
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");

-- CreateIndex
CREATE INDEX "CreditNoteItem_partId_idx" ON "CreditNoteItem"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");

-- CreateIndex
CREATE INDEX "Sale_orgId_createdAt_idx" ON "Sale"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_orgId_status_idx" ON "Sale"("orgId", "status");

-- CreateIndex
CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");

-- CreateIndex
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_deliveryNoteNumber_key" ON "DeliveryNote"("deliveryNoteNumber");

-- CreateIndex
CREATE INDEX "DeliveryNote_orgId_deliveredAt_idx" ON "DeliveryNote"("orgId", "deliveredAt");

-- CreateIndex
CREATE INDEX "DeliveryNote_saleId_idx" ON "DeliveryNote"("saleId");

-- CreateIndex
CREATE INDEX "DeliveryNote_invoiceId_idx" ON "DeliveryNote"("invoiceId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_saleItemId_idx" ON "DeliveryNoteItem"("saleItemId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_partId_idx" ON "DeliveryNoteItem"("partId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_partId_idx" ON "SaleItem"("partId");

-- CreateIndex
CREATE INDEX "SystemAuditEvent_orgId_createdAt_idx" ON "SystemAuditEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemAuditEvent_entityType_entityId_createdAt_idx" ON "SystemAuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemAuditEvent_actorUserId_createdAt_idx" ON "SystemAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgFeatureEntitlement_orgId_enabled_idx" ON "OrgFeatureEntitlement"("orgId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrgFeatureEntitlement_orgId_feature_key" ON "OrgFeatureEntitlement"("orgId", "feature");

-- CreateIndex
CREATE INDEX "OrgSubscriptionEvent_orgId_occurredAt_idx" ON "OrgSubscriptionEvent"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrgSubscriptionEvent_provider_providerEventId_idx" ON "OrgSubscriptionEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "OrgUsageSnapshot_orgId_metric_capturedAt_idx" ON "OrgUsageSnapshot"("orgId", "metric", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUsageSnapshot_orgId_periodKey_metric_key" ON "OrgUsageSnapshot"("orgId", "periodKey", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSecurityPolicy_orgId_key" ON "OrgSecurityPolicy"("orgId");

-- CreateIndex
CREATE INDEX "BranchOperatingHours_branchId_idx" ON "BranchOperatingHours"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOperatingHours_branchId_dayOfWeek_key" ON "BranchOperatingHours"("branchId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "BranchNumberingSettings_branchId_key" ON "BranchNumberingSettings"("branchId");

-- CreateIndex
CREATE INDEX "CustomerConsent_orgId_clientId_consentType_idx" ON "CustomerConsent"("orgId", "clientId", "consentType");

-- CreateIndex
CREATE INDEX "CustomerConsent_orgId_capturedAt_idx" ON "CustomerConsent"("orgId", "capturedAt");

-- CreateIndex
CREATE INDEX "ClientMergeRecord_orgId_mergedAt_idx" ON "ClientMergeRecord"("orgId", "mergedAt");

-- CreateIndex
CREATE INDEX "ClientMergeRecord_sourceClientId_idx" ON "ClientMergeRecord"("sourceClientId");

-- CreateIndex
CREATE INDEX "ClientMergeRecord_targetClientId_idx" ON "ClientMergeRecord"("targetClientId");

-- CreateIndex
CREATE INDEX "DeviceSpecification_orgId_key_idx" ON "DeviceSpecification"("orgId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSpecification_deviceId_key_key" ON "DeviceSpecification"("deviceId", "key");

-- CreateIndex
CREATE INDEX "JobAssignmentHistory_orgId_jobId_startedAt_idx" ON "JobAssignmentHistory"("orgId", "jobId", "startedAt");

-- CreateIndex
CREATE INDEX "JobAssignmentHistory_assignedToId_startedAt_idx" ON "JobAssignmentHistory"("assignedToId", "startedAt");

-- CreateIndex
CREATE INDEX "JobStatusHistory_orgId_jobId_changedAt_idx" ON "JobStatusHistory"("orgId", "jobId", "changedAt");

-- CreateIndex
CREATE INDEX "JobStatusHistory_orgId_toStatus_changedAt_idx" ON "JobStatusHistory"("orgId", "toStatus", "changedAt");

-- CreateIndex
CREATE INDEX "DiagnosisReport_orgId_jobId_createdAt_idx" ON "DiagnosisReport"("orgId", "jobId", "createdAt");

-- CreateIndex
CREATE INDEX "RepairTask_orgId_jobId_status_idx" ON "RepairTask"("orgId", "jobId", "status");

-- CreateIndex
CREATE INDEX "RepairTask_assignedToId_status_dueAt_idx" ON "RepairTask"("assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CustomerApproval_orgId_jobId_status_idx" ON "CustomerApproval"("orgId", "jobId", "status");

-- CreateIndex
CREATE INDEX "CustomerApproval_orgId_requestedAt_idx" ON "CustomerApproval"("orgId", "requestedAt");

-- CreateIndex
CREATE INDEX "QualityCheck_orgId_jobId_status_idx" ON "QualityCheck"("orgId", "jobId", "status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_orgId_status_openedAt_idx" ON "WarrantyClaim"("orgId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "WarrantyClaim_originalJobId_idx" ON "WarrantyClaim"("originalJobId");

-- CreateIndex
CREATE INDEX "InventoryCategory_orgId_isActive_idx" ON "InventoryCategory"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_orgId_name_key" ON "InventoryCategory"("orgId", "name");

-- CreateIndex
CREATE INDEX "StockLocation_orgId_branchId_isActive_idx" ON "StockLocation"("orgId", "branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_orgId_code_key" ON "StockLocation"("orgId", "code");

-- CreateIndex
CREATE INDEX "PartLocationStock_orgId_locationId_idx" ON "PartLocationStock"("orgId", "locationId");

-- CreateIndex
CREATE INDEX "PartLocationStock_partId_idx" ON "PartLocationStock"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "PartLocationStock_partId_locationId_key" ON "PartLocationStock"("partId", "locationId");

-- CreateIndex
CREATE INDEX "SupplierPrice_orgId_supplierId_validFrom_idx" ON "SupplierPrice"("orgId", "supplierId", "validFrom");

-- CreateIndex
CREATE INDEX "SupplierPrice_partId_validFrom_idx" ON "SupplierPrice"("partId", "validFrom");

-- CreateIndex
CREATE INDEX "ReorderRule_orgId_isActive_idx" ON "ReorderRule"("orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderRule_partId_locationId_key" ON "ReorderRule"("partId", "locationId");

-- CreateIndex
CREATE INDEX "InvoiceLine_orgId_invoiceId_idx" ON "InvoiceLine"("orgId", "invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_sourceType_sourceId_idx" ON "InvoiceLine"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "DocumentTaxLine_orgId_documentType_documentId_idx" ON "DocumentTaxLine"("orgId", "documentType", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Receipt_orgId_issuedAt_idx" ON "Receipt"("orgId", "issuedAt");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_orgId_paymentId_idx" ON "PaymentAllocation"("orgId", "paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_targetType_targetId_idx" ON "PaymentAllocation"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "CashierShift_orgId_branchId_status_idx" ON "CashierShift"("orgId", "branchId", "status");

-- CreateIndex
CREATE INDEX "CashierShift_cashierId_openedAt_idx" ON "CashierShift"("cashierId", "openedAt");

-- CreateIndex
CREATE INDEX "Conversation_orgId_status_lastMessageAt_idx" ON "Conversation"("orgId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_idx" ON "Conversation"("clientId");

-- CreateIndex
CREATE INDEX "Conversation_jobId_idx" ON "Conversation"("jobId");

-- CreateIndex
CREATE INDEX "ConversationMessage_orgId_conversationId_createdAt_idx" ON "ConversationMessage"("orgId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_providerMessageId_idx" ON "ConversationMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "CommunicationTemplateVersion_orgId_status_idx" ON "CommunicationTemplateVersion"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationTemplateVersion_templateId_version_key" ON "CommunicationTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "FileAsset_orgId_ownerType_ownerId_idx" ON "FileAsset"("orgId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "FileAsset_storageKey_idx" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_complaintNumber_key" ON "Complaint"("complaintNumber");

-- CreateIndex
CREATE INDEX "Complaint_orgId_status_createdAt_idx" ON "Complaint"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_orgId_createdAt_idx" ON "Complaint"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_jobId_idx" ON "Complaint"("jobId");

-- CreateIndex
CREATE INDEX "SalesTarget_orgId_period_idx" ON "SalesTarget"("orgId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_orgId_userId_period_key" ON "SalesTarget"("orgId", "userId", "period");

