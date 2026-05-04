import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getClientBill } from "@/lib/billing";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { canGenerateInvoiceForStatus, formatQuotationNumber } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { InvoiceDocumentV2 } from "@/lib/pdf/InvoiceDocumentV2";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatInvoiceDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
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
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

async function toDataUriFromLocal(filePath: string, contentType: string) {
  const bytes = await readFile(filePath);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function resolveInvoiceLogo() {
  const localCandidates: Array<{ file: string; type: string }> = [
    { file: path.join(process.cwd(), "public", "eagle-info-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "eagle-info-logo.webp"), type: "image/webp" },
    { file: path.join(process.cwd(), "public", "invoice-logo.png"), type: "image/png" },
    { file: path.join(process.cwd(), "public", "invoice-logo.jpg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "invoice-logo.jpeg"), type: "image/jpeg" },
    { file: path.join(process.cwd(), "public", "invoice-logo.webp"), type: "image/webp" },
  ];

  for (const candidate of localCandidates) {
    try {
      return await toDataUriFromLocal(candidate.file, candidate.type);
    } catch {
      // try next
    }
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
    const remoteCandidates = [
      `${baseUrl}/eagle-info-logo.png`,
      `${baseUrl}/eagle-info-logo.jpg`,
      `${baseUrl}/eagle-info-logo.jpeg`,
      `${baseUrl}/invoice-logo.png`,
    ];
    for (const candidate of remoteCandidates) {
      const remote = await toDataUriFromRemote(candidate);
      if (remote) return remote;
    }
  }

  return undefined;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { session, user } = await getCurrentUserRole();

  if (!( ["ADMIN", "OPS"].includes(user.role) || can.approveInvoices(user) )) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      repairPath: true,
      deviceType: true,
      brand: true,
      model: true,
      serialOrImei: true,
      accessories: true,
      physicalNotes: true,
      issueDescription: true,
      workflowReason: true,
      statusNote: true,
      diagnosisNotes: true,
      externalDiagnosis: true,
      recommendedRepair: true,
      recommendationOption: true,
      communicationStatus: true,
      clientConversationNote: true,
      lastClientContactAt: true,
      partsNeeded: true,
      clientBill: true,
      vatApplicable: true,
      externalTechBill: true,
      externalTechFee: true,
      externalPaid: true,
      externalPaidAt: true,
      externalPaymentRef: true,
      clientApproved: true,
      approvalDate: true,
      quotedAt: true,
      repairTimeline: true,
      timelineMinMinutes: true,
      timelineMaxMinutes: true,
      timelineConfidence: true,
      timelineNote: true,
      technicianNotes: true,
      workDone: true,
      partsReplaced: true,
      receivedAt: true,
      completedAt: true,
      deliveredAt: true,
      deliveryMethod: true,
      deliveredTo: true,
      closedAt: true,
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canGenerateInvoiceForStatus(job.status)) {
    return NextResponse.json(
      { error: "Invoice can be generated only after repair reaches pickup/completion stage." },
      { status: 409 },
    );
  }

  const currency = getAppCurrency();
  const branding = await getDocumentBrandingSettings();
  const clientBill = getClientBill(job) ?? 0;
  const vatApplicable = (job as { vatApplicable?: boolean }).vatApplicable ?? true;
  const vatRate = Math.max(0, branding.vatRatePercent) / 100;
  const repairCost = vatApplicable && clientBill > 0 ? clientBill / (1 + vatRate) : clientBill;
  const vatAmount = vatApplicable ? Math.max(clientBill - repairCost, 0) : 0;
  const issuedAtDate = new Date();
  const dueDate = new Date(issuedAtDate);
  dueDate.setDate(dueDate.getDate() + branding.quoteValidityDays);
  const logoUrl = await resolveInvoiceLogo();
  const normalizedFooterText =
    branding.footerText
      .replace("Eagle InfoSolutions SMC Limited", "Eagle Info Solutions SMC Limited")
      .trim() === "System built by Almeida @ 2026 all rights reserved."
      ? "System built by Almeida @ 2026 all rights reserved."
      : branding.footerText.replace("Eagle InfoSolutions SMC Limited", "Eagle Info Solutions SMC Limited");
  const quotationNumber = formatQuotationNumber(
    job.jobNumber,
    issuedAtDate,
    branding.quotePrefix,
    branding.quoteFormat,
    branding.sequencePadLength,
  );
  const invoiceNumber = `INV-${quotationNumber.replace(/\s+/g, "-")}`;

  await prisma.job.update({
    where: { id: job.id },
    data: {
      invoiceIssuedAt: issuedAtDate,
      invoiceNumber,
    },
  });

  await prisma.auditLog.create({
    data: {
      jobId: job.id,
      userId: session.user.id,
      action: "INVOICE_GENERATED",
      detail: JSON.stringify({ invoiceNumber }),
    },
  });

  const invoiceElement = createElement(InvoiceDocumentV2, {
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
    preparedByName: user.name,
    preparedByRole: user.role,
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

  let body: Uint8Array;
  try {
    const pdf = await renderToBuffer(invoiceElement as never);
    body = new Uint8Array(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json(
      { error: `Invoice PDF generation failed: ${message}` },
      { status: 500 },
    );
  }

  const bytes = new Uint8Array(body.length);
  bytes.set(body);
  const blob = new Blob([bytes], { type: "application/pdf" });

  return new Response(blob, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="invoice-${job.jobNumber}.pdf"`,
    },
  });
}
