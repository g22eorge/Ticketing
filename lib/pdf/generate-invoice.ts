import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getClientBill } from "@/lib/billing";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { canGenerateInvoiceForStatus, formatQuotationNumber } from "@/lib/documents";
import { InvoiceDocumentV2 } from "@/lib/pdf/InvoiceDocumentV2";
import { prisma } from "@/lib/prisma";

function formatInvoiceDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
    timeZone: "Africa/Nairobi",
  });
}

function prettyEnum(value: string | null | undefined) {
  if (!value) return "N/A";
  return value.replaceAll("_", " ");
}

function compactText(value: string | null | undefined, max = 90) {
  if (!value) return "N/A";
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}...`;
}

function compactListText(value: string | null | undefined, max = 220) {
  if (!value) return "N/A";
  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

async function toDataUriFromRemote(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function toDataUriFromLocal(filePath: string, contentType: string) {
  const bytes = await readFile(filePath);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function resolveInvoiceLogo() {
  const localCandidates = [
    { file: path.join(process.cwd(), "public", "eagle-info-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.webp"), type: "image/webp" },
    { file: path.join(process.cwd(), "public", "invoice-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "invoice-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "invoice-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "invoice-logo.webp"), type: "image/webp" },
  ];
  for (const c of localCandidates) {
    try { return await toDataUriFromLocal(c.file, c.type); } catch { /* try next */ }
  }
  const explicit = process.env.INVOICE_LOGO_URL;
  if (explicit) {
    if (explicit.startsWith("data:")) return explicit;
    if (explicit.startsWith("http://") || explicit.startsWith("https://")) {
      const remote = await toDataUriFromRemote(explicit);
      if (remote) return remote;
    }
  }
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (baseUrl) {
    for (const url of [
      `${baseUrl}/eagle-info-logo.png`,
      `${baseUrl}/eagle-info-logo.jpg`,
      `${baseUrl}/invoice-logo.png`,
    ]) {
      const remote = await toDataUriFromRemote(url);
      if (remote) return remote;
    }
  }
  return undefined;
}

export type GenerateInvoiceResult =
  | { ok: true; buffer: Buffer; filename: string; invoiceNumber: string; clientPhone: string }
  | { ok: false; error: string };

export async function generateInvoiceBuffer(
  jobId: string,
  staffName: string,
  staffRole: string,
  staffUserId?: string,
): Promise<GenerateInvoiceResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true, jobNumber: true, status: true, repairPath: true,
      deviceType: true, brand: true, model: true, serialOrImei: true,
      accessories: true, physicalNotes: true, issueDescription: true,
      diagnosisNotes: true, externalDiagnosis: true, recommendedRepair: true,
      recommendationOption: true, clientConversationNote: true,
      partsNeeded: true, clientBill: true, vatApplicable: true,
      workDone: true, partsReplaced: true,
      clientApproved: true, approvalDate: true, quotedAt: true,
      repairTimeline: true, technicianNotes: true,
      receivedAt: true, completedAt: true, closedAt: true,
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
    },
  });

  if (!job) return { ok: false, error: "Job not found" };
  if (!canGenerateInvoiceForStatus(job.status)) {
    return { ok: false, error: "Invoice can only be generated after repair reaches pickup/completion stage" };
  }

  const currency = getAppCurrency();
  const branding = await getDocumentBrandingSettings();
  const clientBill = getClientBill(job) ?? 0;
  const vatApplicable = (job as { vatApplicable?: boolean }).vatApplicable ?? true;
  const vatRate = Math.max(0, branding.vatRatePercent) / 100;
  const repairCost = vatApplicable && clientBill > 0 ? clientBill / (1 + vatRate) : clientBill;
  const vatAmount = vatApplicable ? Math.max(clientBill - repairCost, 0) : 0;
  const issuedAtDate = new Date();
  const logoUrl = await resolveInvoiceLogo();
  const normalizedFooterText = branding.footerText
    .replace("Eagle InfoSolutions SMC Limited", "Eagle Info Solutions SMC Limited");
  const quotationNumber = formatQuotationNumber(
    job.jobNumber, issuedAtDate, branding.quotePrefix,
    branding.quoteFormat, branding.sequencePadLength,
  );
  const invoiceNumber = `INV-${quotationNumber.replace(/\s+/g, "-")}`;

  await prisma.job.update({
    where: { id: job.id },
    data: { invoiceIssuedAt: issuedAtDate, invoiceNumber },
  }).catch(() => null);

  if (staffUserId) {
    await prisma.auditLog.create({
      data: {
        jobId: job.id, userId: staffUserId,
        action: "INVOICE_GENERATED",
        detail: JSON.stringify({ invoiceNumber }),
      },
    }).catch(() => null);
  }

  const docElement = createElement(InvoiceDocumentV2, {
    companyName: branding.companyName,
    companyTagline: branding.companyTagline ?? "",
    companyAddressLine1: branding.companyAddressLine1,
    companyAddressLine2: branding.companyAddressLine2,
    companyContacts: branding.companyContacts,
    companyEmail: branding.companyEmail ?? "",
    companyWebsite: branding.companyWebsite ?? "",
    companyLogoUrl: logoUrl,
    invoiceNumber,
    dateIssued: formatInvoiceDate(issuedAtDate),
    repairId: job.jobNumber,
    preparedByName: staffName,
    preparedByRole: staffRole,
    clientName: job.client.fullName,
    clientPhone: job.client.phone,
    clientEmail: compactText(job.client.email, 36),
    clientOrganization: compactText(job.client.organization, 40),
    deviceType: prettyEnum(job.deviceType),
    deviceLabel: compactText(`${job.brand} ${job.model}`, 45),
    serialOrImei: compactText(job.serialOrImei, 30),
    diagnosisSummary: compactListText(job.diagnosisNotes ?? job.externalDiagnosis, 180),
    workDone: compactListText(job.workDone, 180),
    partsReplaced: compactListText(job.partsReplaced, 180),
    repairCost: formatMoney(repairCost, currency),
    vatApplicable,
    vatLabel: `${branding.vatLabel} (${branding.vatRatePercent}%)`,
    vatAmount: formatMoney(vatAmount, currency),
    totalAmountPayable: formatMoney(clientBill, currency),
    isPaid: job.clientApproved === true,
    status: prettyEnum(job.status),
    currency,
    termsText: branding.termsText,
    footerText: normalizedFooterText,
    signatureCompanyLabel: branding.signatureCompanyLabel,
    signatureClientLabel: branding.signatureClientLabel,
  });

  const pdf = await renderToBuffer(docElement as never);
  return {
    ok: true,
    buffer: Buffer.from(pdf),
    filename: `invoice-${job.jobNumber}.pdf`,
    invoiceNumber,
    clientPhone: job.client.phone,
  };
}
