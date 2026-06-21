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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user, orgId } = await requireOrgSession();

  if (!can.createInvoices(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { status, notes } = body as { status?: string; notes?: string };

  const invoice = await prisma.invoice.findFirst({ where: { id, orgId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (status && !["DRAFT", "ISSUED", "PAID", "VOID"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      ...(status ? { status: status as import("@prisma/client").InvoiceStatus } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { user, orgId } = await requireOrgSession();

  if (!can.createInvoices(user) && !can.viewFinancials(user) && !can.viewAllSales(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      client: true,
      job: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const logoUrl = await resolvePdfLogo(branding?.companyLogoUrl);
  const issuedAt = invoice.issuedAt ?? new Date();
  const currency = invoice.currency;
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");

  const lineItems: EagleInfoLineItem[] = invoice.lines.map((item) => ({
    name: item.description,
    sku: null,
    quantity: item.quantity,
    rate: formatMoney(item.unitPrice, currency),
    amount: formatMoney(item.lineTotal, currency),
  }));

  const subTotal = invoice.lines.reduce<number>((sum, l) => sum + l.lineTotal, 0);
  const vatAmount = invoice.lines.reduce<number>((sum, l) => sum + l.taxAmount, 0);

  const docElement = createElement(EagleInfoDocument, {
    companyName: branding.companyName,
    companyAddress: address,
    companyPhone: branding.companyContacts || null,
    companyEmail: branding.companyEmail || null,
    companyLogoUrl: logoUrl || null,
    docTitle: "Invoice",
    docNumber: invoice.invoiceNumber,
    docDate: formatEATDocDate(issuedAt),
    terms: null,
    dueDate: invoice.dueDate ? formatEATDocDate(invoice.dueDate) : null,
    clientName: invoice.client?.fullName ?? "Client",
    clientEmail: invoice.client?.email ?? null,
    clientPhone: invoice.client?.phone ?? null,
    clientLocation: [invoice.client?.organization, invoice.client?.address].filter(Boolean).join("\n") || null,
    lineItems,
    subTotal: formatMoney(subTotal, currency),
    vatLabel: vatAmount > 0 ? branding.vatLabel + " (" + branding.vatRatePercent + "%)" : null,
    vatAmount: vatAmount > 0 ? formatMoney(vatAmount, currency) : null,
    totalLabel: "Total",
    totalAmount: formatMoney(invoice.totalAmount, currency),
    paymentMade: formatMoney(invoice.paidAmount, currency),
    balanceDue: formatMoney(Math.max(0, invoice.totalAmount - invoice.paidAmount), currency),
    notes: invoice.notes ?? null,
    paymentTo: null,
    termsText: branding.termsText || "Payment is due by the stated date.",
  });

  try {
    const pdf = await renderToBuffer(docElement as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"invoice-" + invoice.invoiceNumber + ".pdf\"",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: "Invoice PDF generation failed: " + message }, { status: 500 });
  }
}
