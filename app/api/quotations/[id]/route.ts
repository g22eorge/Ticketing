import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { formatEATDocDate } from "@/lib/date-eat";
import { formatMoney } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { can } from "@/lib/permissions";
import { EagleInfoDocument, type EagleInfoLineItem } from "@/lib/pdf/EagleInfoDocument";
import { resolvePdfLogo } from "@/lib/pdf/pdf-utils";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user, orgId } = await requireOrgSession();

  if (!can.createQuotations(user) && !can.viewAllSales(user) && !can.viewFinancials(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quotation = await prisma.quotation.findFirst({
    where: {
      id,
      orgId,
      ...(!can.viewAllSales(user) && !can.viewFinancials(user) ? { createdById: user.id } : {}),
    },
    include: {
      lead: { select: { fullName: true, phone: true, email: true, organization: true, interest: true } },
      client: { select: { fullName: true, phone: true, email: true, organization: true } },
      job: { select: { jobNumber: true, brand: true, model: true, issueDescription: true } },
      createdBy: { select: { name: true, role: true } },
      items: { orderBy: { createdAt: "asc" }, include: { part: { select: { sku: true } } } },
    },
  });

  if (!quotation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const logoUrl = await resolvePdfLogo();
  const recipient = quotation.client ?? quotation.lead;
  const issuedAt = quotation.sentAt ?? quotation.createdAt;
  const validUntil = quotation.validUntil ?? new Date(issuedAt.getTime() + branding.quoteValidityDays * 86400000);
  const currency = quotation.currency;
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");
  const lineItems: EagleInfoLineItem[] = quotation.items.length > 0
    ? quotation.items.map((item) => ({
        name: item.description,
        sku: item.part?.sku ?? null,
        quantity: item.quantity,
        rate: formatMoney(item.unitPrice, currency),
        amount: formatMoney(item.lineTotal, currency),
      }))
    : [{
        name: quotation.job
          ? `Repair quote - ${quotation.job.jobNumber} ${quotation.job.brand} ${quotation.job.model}`
          : quotation.lead?.interest ?? "Quotation",
        quantity: 1,
        rate: formatMoney(quotation.totalAmount, currency),
        amount: formatMoney(quotation.totalAmount, currency),
      }];

  const docElement = createElement(EagleInfoDocument, {
    companyName: branding.companyName,
    companyAddress: address,
    companyPhone: branding.companyContacts || null,
    companyEmail: branding.companyEmail || null,
    companyLogoUrl: logoUrl || null,
    docTitle: "Estimate",
    docNumber: quotation.quoteNumber,
    docDate: formatEATDocDate(issuedAt),
    terms: `Valid until ${formatEATDocDate(validUntil)}`,
    dueDate: null,
    clientName: recipient?.fullName ?? "Client",
    clientEmail: recipient?.email ?? null,
    clientPhone: recipient?.phone ?? null,
    clientLocation: recipient?.organization ?? null,
    lineItems,
    subTotal: formatMoney(quotation.subtotal, currency),
    vatLabel: quotation.vatAmount > 0 ? `${branding.vatLabel} (${branding.vatRatePercent}%)` : null,
    vatAmount: quotation.vatAmount > 0 ? formatMoney(quotation.vatAmount, currency) : null,
    totalLabel: "Total",
    totalAmount: formatMoney(quotation.totalAmount, currency),
    paymentMade: formatMoney(0, currency),
    balanceDue: formatMoney(quotation.totalAmount, currency),
    notes: [
      quotation.job ? `Job: ${quotation.job.jobNumber} - ${quotation.job.brand} ${quotation.job.model}` : null,
      quotation.job?.issueDescription ? `Issue: ${quotation.job.issueDescription}` : null,
      quotation.lead?.interest ? `Interest: ${quotation.lead.interest}` : null,
      quotation.notes,
    ].filter(Boolean).join("\n"),
    paymentTo: null,
    termsText: branding.termsText || "Quotation is valid until the stated date.",
  });

  try {
    const pdf = await renderToBuffer(docElement as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="quotation-${quotation.quoteNumber}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: `Quotation PDF generation failed: ${message}` }, { status: 500 });
  }
}
