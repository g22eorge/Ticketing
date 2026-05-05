import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import { getClientBill } from "@/lib/billing";
import { formatEATDocDate } from "@/lib/date-eat";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { canGenerateInvoiceForStatus, formatQuotationNumber } from "@/lib/documents";
import { compactText, compactListText, prettyEnum, resolveInvoiceLogo } from "@/lib/pdf/pdf-utils";
import { InvoiceDocumentV2 } from "@/lib/pdf/InvoiceDocumentV2";
import { prisma } from "@/lib/prisma";

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
  const vatApplicable = job.vatApplicable ?? true;
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

  // Stamp the invoice number and log generation in a single transaction
  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { invoiceIssuedAt: issuedAtDate, invoiceNumber },
    }),
    ...(staffUserId ? [prisma.auditLog.create({
      data: {
        jobId: job.id,
        userId: staffUserId,
        action: "INVOICE_GENERATED",
        detail: JSON.stringify({ invoiceNumber }),
      },
    })] : []),
  ]).catch(() => null);

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
    dateIssued: formatEATDocDate(issuedAtDate),
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
