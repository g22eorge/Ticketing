/**
 * GET /api/templates/preview?key=invoice_classic&kind=INVOICE
 *
 * Renders a sample PDF for a given template key so users can preview it
 * before setting it as default. Uses realistic dummy data — no real job or
 * client data is exposed.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import {
  type DocKind,
  type TemplateKey,
  InvoiceTemplateComponent,
  JobCardTemplateComponent,
  QuotationTemplateComponent,
  ReceiptTemplateComponent,
} from "@/lib/pdf/templates";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Logo resolver (same as invoice route) ─────────────────────────────────────

async function resolveLogoDataUri(): Promise<string | undefined> {
  const candidates: Array<{ file: string; type: string }> = [
    { file: path.join(process.cwd(), "public", "eagle-info-logo.png"),  type: "image/png"  },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpg"),  type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "invoice-logo.png"),     type: "image/png"  },
    { file: path.join(process.cwd(), "public", "invoice-logo.jpg"),     type: "image/jpeg" },
  ];
  for (const c of candidates) {
    try {
      const bytes = await readFile(c.file);
      return `data:${c.type};base64,${bytes.toString("base64")}`;
    } catch { /* try next */ }
  }
  return undefined;
}

// ── Sample / dummy data ───────────────────────────────────────────────────────

const SAMPLE = {
  companyName:       "Eagle Info Tech Ltd",
  companyTagline:    "Expert Device Repair & Support",
  companyAddressLine1: "Plot 42, Kampala Road",
  companyAddressLine2: "Kampala, Uganda",
  companyContacts:   "+256 700 123 456",
  companyEmail:      "info@eagleinfo.ug",
  companyWebsite:    "www.eagleinfo.ug",

  documentNumber:  "EIS 01/2025/0042",
  invoiceNumber:   "INV-EIS-01/2025/0042",
  dateIssued:      "29 May 2025",
  validUntil:      "12 Jun 2025",
  repairId:        "EI-2025-0042",
  preparedByName:  "Alice Nakato",
  preparedByRole:  "Operations",

  clientName:      "James Ochieng",
  clientPhone:     "+256 772 456 789",
  clientEmail:     "j.ochieng@example.com",
  clientOrganization: "Ochieng & Associates",

  deviceType:      "Android Phone",
  deviceLabel:     "Samsung Galaxy S23 Ultra",
  serialOrImei:    "359123450000001",
  accessories:     "Charger | Back cover",
  physicalCondition: "Cracked screen corner; no other physical damage",
  customerIssue:   "Phone fell and screen is cracked. Touch is unresponsive in top-right quadrant.",
  diagnosisSummary: "LCD + digitizer assembly damaged. Internal components intact.",
  scopeOfWork:     "Replace LCD + digitizer assembly | Clean charging port | Software health check",
  partsNeeded:     "Samsung Galaxy S23 Ultra AMOLED display assembly",
  technicianNotes: "Replacement screen sourced from authorised supplier. Calibration required post-fit.",
  repairCost:      "UGX 480,000",
  vatApplicable:   true,
  vatLabel:        "VAT (18%)",
  vatAmount:       "UGX 86,400",
  totalAmountPayable: "UGX 566,400",
  estimatedDuration: "2 – 3 business days",
  approvalStatus:  "Approved",
  recommendation:  "Proceed with repair",
  notes:           "Client to be contacted via WhatsApp when device is ready for pickup.",
  status:          "COMPLETED",
  currency:        "UGX",
  termsText:       "Payment is due on collection.\nAll repairs carry a 30-day limited warranty on parts and labour.\nEagle Info Tech is not liable for pre-existing software issues.",
  footerText:      "Thank you for trusting Eagle Info Tech. We value your business.",
  signatureCompanyLabel: "Authorised by Eagle Info Tech",
  signatureClientLabel:  "Client Signature",
  documentTitle:   "INVOICE",
};

const SAMPLE_SALE = {
  saleNumber:     "POS-2025-0018",
  status:         "PAID",
  createdAt:      new Date("2025-05-29T11:00:00Z"),
  currency:       "UGX",
  branch:         { name: "Main Branch" },
  client:         { fullName: "Grace Apio", phone: "+256 701 987 654" },
  subtotal:       85000,
  discountAmount: 0,
  vatAmount:      15300,
  totalAmount:    100300,
  paidAmount:     100300,
  items: [
    { id: "1", description: "Screen Protector (Samsung S23)", quantity: 1, unitPrice: 35000, lineTotal: 35000 },
    { id: "2", description: "USB-C Fast Charger (65W)",        quantity: 1, unitPrice: 50000, lineTotal: 50000 },
  ],
  payments: [
    { id: "p1", amount: 100300, method: "MOBILE_MONEY", reference: "MPS-2025-A1234", receivedAt: new Date("2025-05-29T11:05:00Z") },
  ],
};

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth check — anyone who can view financials or manage branding can preview
  const { user, orgId, org } = await requireOrgSession();
  if (
    !can.viewFinancials(user) &&
    !can.manageUsers(user) &&
    !["ADMIN", "MANAGER", "OPS", "FRONT_DESK"].includes(user.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const key  = (searchParams.get("key")  ?? "").trim() as TemplateKey;
  const kind = (searchParams.get("kind") ?? "").trim().toUpperCase() as DocKind;

  const VALID_KINDS: DocKind[] = ["INVOICE", "QUOTATION", "JOB_CARD", "RECEIPT"];
  if (!key || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Missing or invalid key/kind" }, { status: 400 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const orgRow   = await prisma.organization.findUnique({ where: { id: orgId }, select: { baseCurrency: true } }).catch(() => null);
  const currency = orgRow?.baseCurrency ?? "UGX";

  // Apply org branding to sample data where available
  const company = {
    companyName:         branding.companyName       || SAMPLE.companyName,
    companyTagline:      branding.documentTitle     || SAMPLE.companyTagline,
    companyAddressLine1: branding.companyAddressLine1 || SAMPLE.companyAddressLine1,
    companyAddressLine2: branding.companyAddressLine2 || SAMPLE.companyAddressLine2,
    companyContacts:     branding.companyContacts   || SAMPLE.companyContacts,
    companyEmail:        branding.companyEmail      || SAMPLE.companyEmail,
    companyWebsite:      branding.companyWebsite    || SAMPLE.companyWebsite,
  };
  const logoUrl = await resolveLogoDataUri();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let element: any;
    let filename: string;

    if (kind === "INVOICE") {
      const Comp = InvoiceTemplateComponent(key);
      element = createElement(Comp as never, {
        ...company,
        companyLogoUrl:    logoUrl,
        documentTitle:     "INVOICE — PREVIEW",
        quotationNumber:   SAMPLE.invoiceNumber,
        dateIssued:        SAMPLE.dateIssued,
        validUntil:        SAMPLE.validUntil,
        repairId:          SAMPLE.repairId,
        preparedByName:    SAMPLE.preparedByName,
        preparedByRole:    SAMPLE.preparedByRole,
        clientName:        SAMPLE.clientName,
        clientPhone:       SAMPLE.clientPhone,
        clientEmail:       SAMPLE.clientEmail,
        clientOrganization: SAMPLE.clientOrganization,
        deviceType:        SAMPLE.deviceType,
        deviceLabel:       SAMPLE.deviceLabel,
        serialOrImei:      SAMPLE.serialOrImei,
        accessories:       SAMPLE.accessories,
        physicalCondition: SAMPLE.physicalCondition,
        customerIssue:     SAMPLE.customerIssue,
        diagnosisSummary:  SAMPLE.diagnosisSummary,
        scopeOfWork:       SAMPLE.scopeOfWork,
        repairCost:        SAMPLE.repairCost,
        vatApplicable:     SAMPLE.vatApplicable,
        vatLabel:          SAMPLE.vatLabel,
        vatAmount:         SAMPLE.vatAmount,
        totalAmountPayable: SAMPLE.totalAmountPayable,
        estimatedDuration: SAMPLE.estimatedDuration,
        approvalStatus:    SAMPLE.approvalStatus,
        recommendation:    SAMPLE.recommendation,
        notes:             SAMPLE.notes,
        status:            SAMPLE.status,
        currency,
        termsText:         branding.termsText || SAMPLE.termsText,
        footerText:        branding.footerText || SAMPLE.footerText,
        signatureCompanyLabel: branding.signatureCompanyLabel || SAMPLE.signatureCompanyLabel,
        signatureClientLabel:  branding.signatureClientLabel  || SAMPLE.signatureClientLabel,
      });
      filename = `preview-invoice-${key}.pdf`;
    } else if (kind === "QUOTATION") {
      const Comp = QuotationTemplateComponent(key);
      element = createElement(Comp as never, {
        ...company,
        companyLogoUrl:    logoUrl,
        quotationNumber:   SAMPLE.documentNumber,
        dateIssued:        SAMPLE.dateIssued,
        validUntil:        SAMPLE.validUntil,
        repairId:          SAMPLE.repairId,
        preparedByName:    SAMPLE.preparedByName,
        preparedByRole:    SAMPLE.preparedByRole,
        clientName:        SAMPLE.clientName,
        clientPhone:       SAMPLE.clientPhone,
        clientEmail:       SAMPLE.clientEmail,
        clientOrganization: SAMPLE.clientOrganization,
        deviceType:        SAMPLE.deviceType,
        deviceLabel:       SAMPLE.deviceLabel,
        serialOrImei:      SAMPLE.serialOrImei,
        accessories:       SAMPLE.accessories,
        physicalCondition: SAMPLE.physicalCondition,
        customerIssue:     SAMPLE.customerIssue,
        diagnosisSummary:  SAMPLE.diagnosisSummary,
        scopeOfWork:       SAMPLE.scopeOfWork,
        repairCost:        SAMPLE.repairCost,
        vatApplicable:     SAMPLE.vatApplicable,
        vatLabel:          SAMPLE.vatLabel,
        vatAmount:         SAMPLE.vatAmount,
        totalAmountPayable: SAMPLE.totalAmountPayable,
        estimatedDuration: SAMPLE.estimatedDuration,
        approvalStatus:    SAMPLE.approvalStatus,
        recommendation:    SAMPLE.recommendation,
        notes:             SAMPLE.notes,
        status:            SAMPLE.status,
        currency,
        termsText:         branding.termsText || SAMPLE.termsText,
        footerText:        branding.footerText || SAMPLE.footerText,
        signatureCompanyLabel: branding.signatureCompanyLabel || SAMPLE.signatureCompanyLabel,
        signatureClientLabel:  branding.signatureClientLabel  || SAMPLE.signatureClientLabel,
      });
      filename = `preview-quotation-${key}.pdf`;
    } else if (kind === "JOB_CARD") {
      const Comp = JobCardTemplateComponent(key);
      element = createElement(Comp as never, {
        ...company,
        companyLogoUrl:    logoUrl,
        documentNumber:    SAMPLE.repairId,
        dateIssued:        SAMPLE.dateIssued,
        repairId:          SAMPLE.repairId,
        preparedByName:    SAMPLE.preparedByName,
        preparedByRole:    SAMPLE.preparedByRole,
        clientName:        SAMPLE.clientName,
        clientPhone:       SAMPLE.clientPhone,
        clientEmail:       SAMPLE.clientEmail,
        clientOrganization: SAMPLE.clientOrganization,
        deviceType:        SAMPLE.deviceType,
        deviceLabel:       SAMPLE.deviceLabel,
        serialOrImei:      SAMPLE.serialOrImei,
        accessories:       SAMPLE.accessories,
        physicalCondition: SAMPLE.physicalCondition,
        customerIssue:     SAMPLE.customerIssue,
        diagnosisSummary:  SAMPLE.diagnosisSummary,
        partsNeeded:       SAMPLE.partsNeeded,
        technicianNotes:   SAMPLE.technicianNotes,
        status:            SAMPLE.status,
        footerText:        branding.footerText || SAMPLE.footerText,
        signatureCompanyLabel: branding.signatureCompanyLabel || SAMPLE.signatureCompanyLabel,
        signatureClientLabel:  branding.signatureClientLabel  || SAMPLE.signatureClientLabel,
      });
      filename = `preview-job-card-${key}.pdf`;
    } else {
      // RECEIPT — use SaleReceiptDocument with dummy sale
      const Comp = ReceiptTemplateComponent(key) as never;
      const brandingForReceipt = {
        documentTitle:     branding.documentTitle || "Receipt",
        companyName:       company.companyName,
        companyContacts:   company.companyContacts,
        companyEmail:      company.companyEmail,
        companyWebsite:    company.companyWebsite,
        companyAddressLine1: company.companyAddressLine1,
        companyAddressLine2: company.companyAddressLine2,
        vatRatePercent:    branding.vatRatePercent ?? 18,
      };
      element = createElement(Comp, {
        sale:     SAMPLE_SALE,
        branding: brandingForReceipt,
      });
      filename = `preview-receipt-${key}.pdf`;
    }

    const pdf = await renderToBuffer(element as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type":        "application/pdf",
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control":       "private, max-age=60",
      },
    });
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack   : undefined;
    console.error("[template-preview]", msg, stack);
    return NextResponse.json(
      { error: "Failed to render preview", detail: msg },
      { status: 500 },
    );
  }
}
