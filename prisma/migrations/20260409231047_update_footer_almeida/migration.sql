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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentBrandingSettings" ("companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "quoteFormat", "quotePrefix", "quoteValidityDays", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent") SELECT "companyAddressLine1", "companyAddressLine2", "companyContacts", "companyEmail", "companyName", "companyTagline", "companyWebsite", "documentTitle", "footerText", "id", "quoteFormat", "quotePrefix", "quoteValidityDays", "sequencePadLength", "signatureClientLabel", "signatureCompanyLabel", "termsText", "updatedAt", "vatDefaultApplicable", "vatLabel", "vatRatePercent" FROM "DocumentBrandingSettings";
DROP TABLE "DocumentBrandingSettings";
ALTER TABLE "new_DocumentBrandingSettings" RENAME TO "DocumentBrandingSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
