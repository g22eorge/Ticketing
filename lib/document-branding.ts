import { prisma } from "@/lib/prisma";
import { getTableColumns } from "@/lib/db-utils";

export const defaultBranding = {
  id: "singleton",
  companyName: "",
  companyTagline: "",
  companyAddressLine1: "",
  companyAddressLine2: "",
  companyContacts: "",
  companyEmail: "",
  companyWebsite: "",
  companyLogoUrl: "",
  documentTitle: "Service Document",
  quotePrefix: "DOC",
  quoteFormat: "{PREFIX} {M}/{YYYY}/{SEQ}",
  quoteValidityDays: 30,
  sequencePadLength: 4,
  vatDefaultApplicable: false,
  vatRatePercent: 18,
  vatLabel: "VAT",
  termsText:
    "Quotation valid for 30 days from date issued.\nWork begins after client approval is recorded.\nFinal timelines may depend on service scope and item availability.\nUncollected items may attract storage fees after notice.",
  footerText: "",
  signatureCompanyLabel: "Signed by: Company",
  signatureClientLabel: "Signed by: Client",
  // Color scheme - Black, Gold & White
  primaryColor: "#000000",
  secondaryColor: "#4F8EF7",
  accentColor: "#4F8EF7",
  backgroundColor: "#FFFFFF",
  surfaceColor: "#F5F5F5",
  borderColor: "#E5E5E5",

  // Template selections
  invoiceTemplateKey: "invoice_classic",
  quotationTemplateKey: "quote_classic",
  jobCardTemplateKey: "job_card_classic",
  receiptTemplateKey: "receipt_classic",
};

type BrandingSettings = typeof defaultBranding;

let rawTableEnsured = false;

function coerceRow(row: Record<string, unknown>): BrandingSettings {
  return {
    id: "singleton",
    companyName: String(row.companyName ?? defaultBranding.companyName),
    companyTagline: row.companyTagline ? String(row.companyTagline) : "",
    companyAddressLine1: String(row.companyAddressLine1 ?? defaultBranding.companyAddressLine1),
    companyAddressLine2: String(row.companyAddressLine2 ?? defaultBranding.companyAddressLine2),
    companyContacts: String(row.companyContacts ?? defaultBranding.companyContacts),
    companyEmail: row.companyEmail ? String(row.companyEmail) : "",
    companyWebsite: row.companyWebsite ? String(row.companyWebsite) : "",
    companyLogoUrl: row.companyLogoUrl ? String(row.companyLogoUrl) : "",
    documentTitle: String(row.documentTitle ?? defaultBranding.documentTitle),
    quotePrefix: String(row.quotePrefix ?? defaultBranding.quotePrefix),
    quoteFormat: String(row.quoteFormat ?? defaultBranding.quoteFormat),
    quoteValidityDays: Number(row.quoteValidityDays ?? defaultBranding.quoteValidityDays),
    sequencePadLength: Number(row.sequencePadLength ?? defaultBranding.sequencePadLength),
    vatDefaultApplicable: Boolean(row.vatDefaultApplicable ?? defaultBranding.vatDefaultApplicable),
    vatRatePercent: Number(row.vatRatePercent ?? defaultBranding.vatRatePercent),
    vatLabel: String(row.vatLabel ?? defaultBranding.vatLabel),
    termsText: String(row.termsText ?? defaultBranding.termsText),
    footerText: String(row.footerText ?? defaultBranding.footerText),
    signatureCompanyLabel: String(row.signatureCompanyLabel ?? defaultBranding.signatureCompanyLabel),
    signatureClientLabel: String(row.signatureClientLabel ?? defaultBranding.signatureClientLabel),
    primaryColor: String(row.primaryColor ?? defaultBranding.primaryColor),
    secondaryColor: String(row.secondaryColor ?? defaultBranding.secondaryColor),
    accentColor: String(row.accentColor ?? defaultBranding.accentColor),
    backgroundColor: String(row.backgroundColor ?? defaultBranding.backgroundColor),
    surfaceColor: String(row.surfaceColor ?? defaultBranding.surfaceColor),
    borderColor: String(row.borderColor ?? defaultBranding.borderColor),

    invoiceTemplateKey: String(row.invoiceTemplateKey ?? defaultBranding.invoiceTemplateKey),
    quotationTemplateKey: String(row.quotationTemplateKey ?? defaultBranding.quotationTemplateKey),
    jobCardTemplateKey: String(row.jobCardTemplateKey ?? defaultBranding.jobCardTemplateKey),
    receiptTemplateKey: String(row.receiptTemplateKey ?? defaultBranding.receiptTemplateKey),
  };
}

async function ensureRawTable() {
  if (rawTableEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DocumentBrandingSettings" (
      id TEXT PRIMARY KEY,
      companyName TEXT NOT NULL,
      companyTagline TEXT,
      companyAddressLine1 TEXT NOT NULL,
      companyAddressLine2 TEXT NOT NULL,
      companyContacts TEXT NOT NULL,
      companyEmail TEXT,
      companyWebsite TEXT,
      companyLogoUrl TEXT,
      documentTitle TEXT NOT NULL,
      quotePrefix TEXT NOT NULL,
      quoteFormat TEXT NOT NULL,
      quoteValidityDays INTEGER NOT NULL,
      sequencePadLength INTEGER NOT NULL,
      vatDefaultApplicable BOOLEAN NOT NULL,
      vatRatePercent REAL NOT NULL,
      vatLabel TEXT NOT NULL,
      termsText TEXT NOT NULL,
      footerText TEXT NOT NULL,
      signatureCompanyLabel TEXT NOT NULL,
      signatureClientLabel TEXT NOT NULL,
      invoiceTemplateKey TEXT NOT NULL DEFAULT 'invoice_classic',
      quotationTemplateKey TEXT NOT NULL DEFAULT 'quote_classic',
      jobCardTemplateKey TEXT NOT NULL DEFAULT 'job_card_classic',
      receiptTemplateKey TEXT NOT NULL DEFAULT 'receipt_classic',
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const colSet = await getTableColumns("DocumentBrandingSettings");

  const ADDABLE_COLUMNS: ReadonlySet<string> = new Set([
    "invoiceTemplateKey", "quotationTemplateKey", "jobCardTemplateKey", "receiptTemplateKey",
    "primaryColor", "secondaryColor", "accentColor", "backgroundColor", "surfaceColor", "borderColor",
    "orgId", "companyLogoUrl",
  ]);
  const addColumn = async (name: string, dflt: string) => {
    if (!ADDABLE_COLUMNS.has(name)) return;
    if (colSet.has(name)) return;
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "DocumentBrandingSettings" ADD COLUMN "${name}" TEXT DEFAULT ${dflt}`,
      );
    } catch {
      /* ignore if already exists in concurrent request */
    }
    colSet.add(name);
  };
  await addColumn("invoiceTemplateKey", "'invoice_classic'");
  await addColumn("quotationTemplateKey", "'quote_classic'");
  await addColumn("jobCardTemplateKey", "'job_card_classic'");
  await addColumn("receiptTemplateKey", "'receipt_classic'");
  await addColumn("primaryColor",   "'#000000'");
  await addColumn("secondaryColor", "'#4F8EF7'");
  await addColumn("accentColor",    "'#4F8EF7'");
  await addColumn("backgroundColor","'#FFFFFF'");
  await addColumn("surfaceColor",   "'#F5F5F5'");
  await addColumn("borderColor",    "'#E5E5E5'");
  await addColumn("orgId",          "NULL");
  await addColumn("companyLogoUrl", "NULL");

  rawTableEnsured = true;
}

async function getViaRaw(orgId?: string) {
  try {
    await ensureRawTable();

    // Try org-specific row first (id = orgId), then legacy singleton
    const rows = orgId
      ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT *
          FROM "DocumentBrandingSettings"
          WHERE id = ${orgId} OR orgId = ${orgId} OR id = 'singleton'
          ORDER BY CASE WHEN id = ${orgId} OR orgId = ${orgId} THEN 0 ELSE 1 END
          LIMIT 1
        `
      : await prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM "DocumentBrandingSettings" WHERE id = 'singleton' LIMIT 1
        `;

    if (!rows[0]) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO "DocumentBrandingSettings" (
            id, companyName, companyTagline, companyAddressLine1, companyAddressLine2,
            companyContacts, companyEmail, companyWebsite, documentTitle,
            quotePrefix, quoteFormat, quoteValidityDays, sequencePadLength,
            vatDefaultApplicable, vatRatePercent, vatLabel, termsText,
            footerText, signatureCompanyLabel, signatureClientLabel,
            invoiceTemplateKey, quotationTemplateKey, jobCardTemplateKey, receiptTemplateKey,
            updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          defaultBranding.id, defaultBranding.companyName, defaultBranding.companyTagline,
          defaultBranding.companyAddressLine1, defaultBranding.companyAddressLine2,
          defaultBranding.companyContacts, defaultBranding.companyEmail, defaultBranding.companyWebsite,
          defaultBranding.documentTitle, defaultBranding.quotePrefix, defaultBranding.quoteFormat,
          defaultBranding.quoteValidityDays, defaultBranding.sequencePadLength,
          defaultBranding.vatDefaultApplicable, defaultBranding.vatRatePercent, defaultBranding.vatLabel,
          defaultBranding.termsText, defaultBranding.footerText,
          defaultBranding.signatureCompanyLabel, defaultBranding.signatureClientLabel,
          defaultBranding.invoiceTemplateKey, defaultBranding.quotationTemplateKey,
          defaultBranding.jobCardTemplateKey, defaultBranding.receiptTemplateKey,
        );
      } catch {
        // Row may already exist (PK or orgId UNIQUE from Prisma-managed schema on Turso).
        // INSERT OR IGNORE handles most cases; this catch is a safety net for edge cases.
      }
      return defaultBranding;
    }

    return coerceRow(rows[0]);
  } catch {
    return defaultBranding;
  }
}

export async function saveDocumentBrandingSettings(orgId: string, data: BrandingSettings) {
  await ensureRawTable();

  const rowId = orgId;

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "DocumentBrandingSettings"
    WHERE id = ${rowId} OR orgId = ${orgId}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await prisma.$executeRaw`
      UPDATE "DocumentBrandingSettings" SET
        orgId = ${orgId},
        companyName = ${data.companyName},
        companyTagline = ${data.companyTagline},
        companyAddressLine1 = ${data.companyAddressLine1},
        companyAddressLine2 = ${data.companyAddressLine2},
        companyContacts = ${data.companyContacts},
        companyEmail = ${data.companyEmail},
        companyWebsite = ${data.companyWebsite},
        companyLogoUrl = ${data.companyLogoUrl ?? ""},
        documentTitle = ${data.documentTitle},
        quotePrefix = ${data.quotePrefix},
        quoteFormat = ${data.quoteFormat},
        quoteValidityDays = ${data.quoteValidityDays},
        sequencePadLength = ${data.sequencePadLength},
        vatDefaultApplicable = ${data.vatDefaultApplicable},
        vatRatePercent = ${data.vatRatePercent},
        vatLabel = ${data.vatLabel},
        termsText = ${data.termsText},
        footerText = ${data.footerText},
        signatureCompanyLabel = ${data.signatureCompanyLabel},
        signatureClientLabel = ${data.signatureClientLabel},
        primaryColor = ${data.primaryColor},
        secondaryColor = ${data.secondaryColor},
        accentColor = ${data.accentColor},
        backgroundColor = ${data.backgroundColor},
        surfaceColor = ${data.surfaceColor},
        borderColor = ${data.borderColor},
        invoiceTemplateKey = ${data.invoiceTemplateKey},
        quotationTemplateKey = ${data.quotationTemplateKey},
        jobCardTemplateKey = ${data.jobCardTemplateKey},
        receiptTemplateKey = ${data.receiptTemplateKey},
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${existing[0].id}
    `;
  } else {
    try {
      await prisma.$executeRaw`
        INSERT INTO "DocumentBrandingSettings" (
          id, orgId,
          companyName, companyTagline, companyAddressLine1, companyAddressLine2,
          companyContacts, companyEmail, companyWebsite, companyLogoUrl, documentTitle,
          quotePrefix, quoteFormat, quoteValidityDays, sequencePadLength,
          vatDefaultApplicable, vatRatePercent, vatLabel, termsText,
          footerText, signatureCompanyLabel, signatureClientLabel,
          primaryColor, secondaryColor, accentColor, backgroundColor, surfaceColor, borderColor,
          invoiceTemplateKey, quotationTemplateKey, jobCardTemplateKey, receiptTemplateKey,
          updatedAt
        ) VALUES (
          ${rowId}, ${orgId},
          ${data.companyName}, ${data.companyTagline},
          ${data.companyAddressLine1}, ${data.companyAddressLine2},
          ${data.companyContacts}, ${data.companyEmail}, ${data.companyWebsite},
          ${data.companyLogoUrl ?? ""},
          ${data.documentTitle}, ${data.quotePrefix}, ${data.quoteFormat},
          ${data.quoteValidityDays}, ${data.sequencePadLength},
          ${data.vatDefaultApplicable}, ${data.vatRatePercent}, ${data.vatLabel},
          ${data.termsText}, ${data.footerText}, ${data.signatureCompanyLabel},
          ${data.signatureClientLabel},
          ${data.primaryColor}, ${data.secondaryColor}, ${data.accentColor},
          ${data.backgroundColor}, ${data.surfaceColor}, ${data.borderColor},
          ${data.invoiceTemplateKey}, ${data.quotationTemplateKey},
          ${data.jobCardTemplateKey}, ${data.receiptTemplateKey},
          CURRENT_TIMESTAMP
        )
      `;
    } catch {
      await prisma.$executeRaw`
        UPDATE "DocumentBrandingSettings" SET
          orgId = ${orgId},
          companyName = ${data.companyName},
          companyTagline = ${data.companyTagline},
          companyAddressLine1 = ${data.companyAddressLine1},
          companyAddressLine2 = ${data.companyAddressLine2},
          companyContacts = ${data.companyContacts},
          companyEmail = ${data.companyEmail},
          companyWebsite = ${data.companyWebsite},
          companyLogoUrl = ${data.companyLogoUrl ?? ""},
          documentTitle = ${data.documentTitle},
          quotePrefix = ${data.quotePrefix},
          quoteFormat = ${data.quoteFormat},
          quoteValidityDays = ${data.quoteValidityDays},
          sequencePadLength = ${data.sequencePadLength},
          vatDefaultApplicable = ${data.vatDefaultApplicable},
          vatRatePercent = ${data.vatRatePercent},
          vatLabel = ${data.vatLabel},
          termsText = ${data.termsText},
          footerText = ${data.footerText},
          signatureCompanyLabel = ${data.signatureCompanyLabel},
          signatureClientLabel = ${data.signatureClientLabel},
          primaryColor = ${data.primaryColor},
          secondaryColor = ${data.secondaryColor},
          accentColor = ${data.accentColor},
          backgroundColor = ${data.backgroundColor},
          surfaceColor = ${data.surfaceColor},
          borderColor = ${data.borderColor},
          invoiceTemplateKey = ${data.invoiceTemplateKey},
          quotationTemplateKey = ${data.quotationTemplateKey},
          jobCardTemplateKey = ${data.jobCardTemplateKey},
          receiptTemplateKey = ${data.receiptTemplateKey},
          updatedAt = CURRENT_TIMESTAMP
        WHERE orgId = ${orgId} OR id = ${rowId}
      `;
    }
  }
}

export async function getDocumentBrandingSettings(orgId?: string): Promise<BrandingSettings> {
  return getViaRaw(orgId);
}
