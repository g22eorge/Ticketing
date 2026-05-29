import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { PaymentReceiptDocument } from "@/lib/pdf/PaymentReceiptDocument";
import { resolveInvoiceLogo } from "@/lib/pdf/pdf-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function prettyEnum(value: string) {
  return value.replaceAll("_", " ");
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const payment = await prisma.payment.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      reference: true,
      receivedAt: true,
      createdBy: { select: { name: true } },
      sale: { select: { id: true, saleNumber: true, client: { select: { fullName: true, phone: true } } } },
      invoice: { select: { id: true, invoiceNumber: true, job: { select: { id: true, jobNumber: true, client: { select: { fullName: true, phone: true } } } } } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [branding, logoUrl] = await Promise.all([
    getDocumentBrandingSettings(orgId),
    resolveInvoiceLogo(),
  ]);
  const receipt = await prisma.receipt.findFirst({
    where: { orgId, paymentId: payment.id },
    select: { receiptNumber: true },
  });
  const currency = normalizeCurrency(payment.currency, org.baseCurrency);
  const forLabel = payment.invoice?.job?.jobNumber
    ? `Repair job ${payment.invoice.job.jobNumber} (${payment.invoice.invoiceNumber})`
    : payment.sale?.saleNumber
      ? `Sale ${payment.sale.saleNumber}`
      : payment.invoice?.invoiceNumber
        ? `Invoice ${payment.invoice.invoiceNumber}`
        : "Payment";

  const clientName = payment.invoice?.job?.client?.fullName
    ?? payment.sale?.client?.fullName
    ?? null;
  const clientPhone = payment.invoice?.job?.client?.phone
    ?? payment.sale?.client?.phone
    ?? null;

  const element = createElement(PaymentReceiptDocument as never, {
    branding: { ...branding, companyLogoUrl: logoUrl ?? null },
    receiptNumber: receipt?.receiptNumber ?? `RCPT-${payment.id.slice(0, 8).toUpperCase()}`,
    receivedAt: payment.receivedAt.toLocaleString("en-GB"),
    method: prettyEnum(payment.method),
    reference: payment.reference,
    amountLabel: formatMoney(payment.amount, currency),
    forLabel,
    receivedBy: payment.createdBy?.name ?? user.name,
    clientName,
    clientPhone,
  });

  const pdf = await renderToBuffer(element as never);
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="receipt-${payment.id.slice(0, 8)}.pdf"`,
    },
  });
}
