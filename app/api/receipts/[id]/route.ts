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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const receipt = await prisma.receipt.findFirst({
    where: { id, orgId },
    select: {
      receiptNumber: true,
      paymentId: true,
    },
  });

  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!receipt.paymentId) {
    return NextResponse.json({ error: "Receipt not linked to a payment" }, { status: 404 });
  }

  const payment = await prisma.payment.findFirst({
    where: { id: receipt.paymentId, orgId },
    include: {
      createdBy: { select: { name: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          job: {
            select: {
              jobNumber: true,
              client: { select: { fullName: true, phone: true } },
            },
          },
        },
      },
      sale: {
        select: {
          saleNumber: true,
          totalAmount: true,
          paidAmount: true,
          client: { select: { fullName: true, phone: true } },
        },
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const logoUrl = await resolveInvoiceLogo(branding?.companyLogoUrl);

  const currency = normalizeCurrency(payment.currency, org.baseCurrency);
  const forLabel = payment.invoice?.job?.jobNumber
    ? "Repair job " + payment.invoice.job.jobNumber + " (" + payment.invoice.invoiceNumber + ")"
    : payment.sale?.saleNumber
      ? "Sale " + payment.sale.saleNumber
      : payment.invoice?.invoiceNumber
        ? "Invoice " + payment.invoice.invoiceNumber
        : "Payment";

  const clientName = payment.invoice?.job?.client?.fullName ?? payment.sale?.client?.fullName ?? null;
  const clientPhone = payment.invoice?.job?.client?.phone ?? payment.sale?.client?.phone ?? null;

  const invoiceTotal =
    payment.invoice?.totalAmount ?? payment.sale?.totalAmount ?? null;
  const priorPaid = payment.invoice?.paidAmount ?? payment.sale?.paidAmount ?? 0;
  const balance =
    invoiceTotal != null ? Math.max(0, invoiceTotal - (priorPaid + payment.amount)) : null;
  const hasPartPayment = invoiceTotal != null && balance != null && balance > 0;

  const element = createElement(PaymentReceiptDocument as never, {
    branding: { ...branding, companyLogoUrl: logoUrl ?? null },
    receiptNumber: receipt.receiptNumber,
    receivedAt: payment.receivedAt.toLocaleString("en-GB"),
    method: prettyEnum(payment.method),
    reference: payment.reference,
    amountLabel: formatMoney(payment.amount, currency),
    forLabel,
    receivedBy: payment.createdBy?.name ?? user.name,
    clientName,
    clientPhone,
    ...(hasPartPayment
      ? {
          totalLabel: "Total Amount",
          totalAmountLabel: formatMoney(invoiceTotal!, currency),
          balanceLabel: formatMoney(balance!, currency),
        }
      : {}),
  });

  const pdf = await renderToBuffer(element as never);
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=\"receipt-" + receipt.receiptNumber + ".pdf\"",
    },
  });
}
