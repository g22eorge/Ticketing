import { prisma } from "@/lib/prisma";

export const defaultBranding = {
  id: "singleton",
  companyName: "",
  companyTagline: "",
  companyAddressLine1: "",
  companyAddressLine2: "",
  companyContacts: "",
  companyEmail: "",
  companyWebsite: "",
  documentTitle: "Job Card",
  quotePrefix: "EIS",
  quoteFormat: "{PREFIX} {M}/{YYYY}/{SEQ}",
  quoteValidityDays: 30,
  sequencePadLength: 4,
  vatDefaultApplicable: false,
  vatRatePercent: 18,
  vatLabel: "VAT",
  termsText:
    "Quotation valid for 30 days from date issued.\nRepair work begins only after approval is recorded.\nParts availability may affect final timeline.\nHidden pre-existing faults may affect final outcome.\nUncollected devices may attract storage fees after notice.",
  footerText: "",
  signatureCompanyLabel: "Signed by: Company",
  signatureClientLabel: "Signed by: Client",
  // Color scheme - Black, Gold & White
  primaryColor: "#000000",
  secondaryColor: "#D4AF37",
  accentColor: "#D4AF37",
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

function hasDelegate() {
  return Boolean((prisma as unknown as { documentBrandingSettings?: unknown }).documentBrandingSettings);
}

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

  // Older installs may have the table without the newer template columns.
  // Keep this local to branding to avoid hard dependency on /api/admin/db-fix.
  const cols = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('DocumentBrandingSettings')
  `.catch(() => []);
  const colSet = new Set(cols.map((c) => c.name));
  const addColumn = async (name: string, sqlType: string, dflt: string) => {
    if (colSet.has(name)) return;
    await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentBrandingSettings" ADD COLUMN "${name}" ${sqlType} DEFAULT ${dflt}`);
    colSet.add(name);
  };
  await addColumn("invoiceTemplateKey", "TEXT", "'invoice_classic'");
  await addColumn("quotationTemplateKey", "TEXT", "'quote_classic'");
  await addColumn("jobCardTemplateKey", "TEXT", "'job_card_classic'");
  await addColumn("receiptTemplateKey", "TEXT", "'receipt_classic'");

  rawTableEnsured = true;
}

async function getViaRaw() {
  try {
    await ensureRawTable();

    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM "DocumentBrandingSettings" WHERE id = 'singleton' LIMIT 1
    `;

    if (!rows[0]) {
      await prisma.$executeRaw`
        INSERT INTO "DocumentBrandingSettings" (
          id, companyName, companyTagline, companyAddressLine1, companyAddressLine2,
          companyContacts, companyEmail, companyWebsite, documentTitle,
          quotePrefix, quoteFormat, quoteValidityDays, sequencePadLength,
          vatDefaultApplicable, vatRatePercent, vatLabel, termsText,
          footerText, signatureCompanyLabel, signatureClientLabel,
          invoiceTemplateKey, quotationTemplateKey, jobCardTemplateKey, receiptTemplateKey,
          updatedAt
        ) VALUES (
          ${defaultBranding.id}, ${defaultBranding.companyName}, ${defaultBranding.companyTagline},
          ${defaultBranding.companyAddressLine1}, ${defaultBranding.companyAddressLine2},
          ${defaultBranding.companyContacts}, ${defaultBranding.companyEmail}, ${defaultBranding.companyWebsite},
          ${defaultBranding.documentTitle}, ${defaultBranding.quotePrefix}, ${defaultBranding.quoteFormat},
          ${defaultBranding.quoteValidityDays}, ${defaultBranding.sequencePadLength},
          ${defaultBranding.vatDefaultApplicable}, ${defaultBranding.vatRatePercent}, ${defaultBranding.vatLabel},
          ${defaultBranding.termsText}, ${defaultBranding.footerText},
          ${defaultBranding.signatureCompanyLabel}, ${defaultBranding.signatureClientLabel},
          ${defaultBranding.invoiceTemplateKey}, ${defaultBranding.quotationTemplateKey}, ${defaultBranding.jobCardTemplateKey}, ${defaultBranding.receiptTemplateKey},
          CURRENT_TIMESTAMP
        )
      `;
      return defaultBranding;
    }

    return coerceRow(rows[0]);
  } catch {
    return defaultBranding;
  }
}

export async function saveDocumentBrandingSettings(orgId: string, data: BrandingSettings) {
  if (hasDelegate()) {
    const delegate = (prisma as unknown as {
      documentBrandingSettings: {
        upsert: (args: {
          where: { orgId: string } | { id: string };
          create: BrandingSettings & { orgId?: string };
          update: BrandingSettings;
        }) => Promise<unknown>;
      };
    }).documentBrandingSettings;

    await delegate.upsert({
      where: { orgId },
      create: { ...data, orgId },
      update: data,
    });
    return;
  }

  await ensureRawTable();

  await prisma.$executeRaw`
    INSERT INTO "DocumentBrandingSettings" (
      id, companyName, companyTagline, companyAddressLine1, companyAddressLine2,
      companyContacts, companyEmail, companyWebsite, documentTitle,
      quotePrefix, quoteFormat, quoteValidityDays, sequencePadLength,
      vatDefaultApplicable, vatRatePercent, vatLabel, termsText,
      footerText, signatureCompanyLabel, signatureClientLabel,
      invoiceTemplateKey, quotationTemplateKey, jobCardTemplateKey, receiptTemplateKey,
      updatedAt
    ) VALUES (
      ${data.id}, ${data.companyName}, ${data.companyTagline},
      ${data.companyAddressLine1}, ${data.companyAddressLine2},
      ${data.companyContacts}, ${data.companyEmail}, ${data.companyWebsite},
      ${data.documentTitle}, ${data.quotePrefix}, ${data.quoteFormat},
      ${data.quoteValidityDays}, ${data.sequencePadLength},
      ${data.vatDefaultApplicable}, ${data.vatRatePercent}, ${data.vatLabel},
      ${data.termsText}, ${data.footerText}, ${data.signatureCompanyLabel},
      ${data.signatureClientLabel},
      ${data.invoiceTemplateKey}, ${data.quotationTemplateKey}, ${data.jobCardTemplateKey}, ${data.receiptTemplateKey},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      companyName = excluded.companyName,
      companyTagline = excluded.companyTagline,
      companyAddressLine1 = excluded.companyAddressLine1,
      companyAddressLine2 = excluded.companyAddressLine2,
      companyContacts = excluded.companyContacts,
      companyEmail = excluded.companyEmail,
      companyWebsite = excluded.companyWebsite,
      documentTitle = excluded.documentTitle,
      quotePrefix = excluded.quotePrefix,
      quoteFormat = excluded.quoteFormat,
      quoteValidityDays = excluded.quoteValidityDays,
      sequencePadLength = excluded.sequencePadLength,
      vatDefaultApplicable = excluded.vatDefaultApplicable,
      vatRatePercent = excluded.vatRatePercent,
      vatLabel = excluded.vatLabel,
      termsText = excluded.termsText,
      footerText = excluded.footerText,
      signatureCompanyLabel = excluded.signatureCompanyLabel,
      signatureClientLabel = excluded.signatureClientLabel,
      invoiceTemplateKey = excluded.invoiceTemplateKey,
      quotationTemplateKey = excluded.quotationTemplateKey,
      jobCardTemplateKey = excluded.jobCardTemplateKey,
      receiptTemplateKey = excluded.receiptTemplateKey,
      updatedAt = CURRENT_TIMESTAMP
  `;
}

export async function getDocumentBrandingSettings(orgId?: string) {
  if (hasDelegate()) {
    const delegate = (prisma as unknown as {
      documentBrandingSettings: {
        findFirst: (args: { where: { orgId?: string } | { id: string } }) => Promise<Record<string, unknown> | null>;
        create: (args: { data: BrandingSettings & { orgId?: string } }) => Promise<Record<string, unknown>>;
      };
    }).documentBrandingSettings;

    const existing = await delegate.findFirst({ where: orgId ? { orgId } : { id: "singleton" } });
    if (existing) {
      return coerceRow(existing);
    }

    const created = await delegate.create({ data: orgId ? { ...defaultBranding, orgId } : defaultBranding });
    return coerceRow(created);
  }

  return getViaRaw();
}
