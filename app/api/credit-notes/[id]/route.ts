import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { formatMoney } from "@/lib/currency";
import { formatEATDocDate } from "@/lib/date-eat";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { EagleInfoDocument, type EagleInfoLineItem } from "@/lib/pdf/EagleInfoDocument";
import { resolveInvoiceLogo } from "@/lib/pdf/pdf-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const creditNote = await prisma.creditNote.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      creditNoteNumber: true,
      currency: true,
      totalAmount: true,
      issuedAt: true,
      reason: true,
      itemsReceivedBackAt: true,
      itemsReceivedBackNote: true,
      sale: {
        select: {
          saleNumber: true,
          client: { select: { fullName: true, phone: true, email: true, organization: true } },
        },
      },
      items: {
        select: { description: true, quantity: true, unitPrice: true, lineTotal: true },
        orderBy: { createdAt: "asc" },
      },
      refunds: { select: { amount: true } },
    },
  });

  if (!creditNote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const logoUrl = await resolveInvoiceLogo(branding?.companyLogoUrl);
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");
  const currency = creditNote.currency;
  const refundedTotal = creditNote.refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const outstandingCredit = Math.max(0, creditNote.totalAmount - refundedTotal);
  const lineItems: EagleInfoLineItem[] = creditNote.items.length > 0
    ? creditNote.items.map((item) => ({
        name: item.description,
        quantity: item.quantity,
        rate: formatMoney(item.unitPrice, currency),
        amount: formatMoney(item.lineTotal, currency),
      }))
    : [{
        name: creditNote.reason ?? "Credit adjustment",
        quantity: 1,
        rate: formatMoney(creditNote.totalAmount, currency),
        amount: formatMoney(creditNote.totalAmount, currency),
      }];

  const docElement = createElement(EagleInfoDocument, {
    companyName: branding.companyName,
    companyAddress: address,
    companyPhone: branding.companyContacts || null,
    companyEmail: branding.companyEmail || null,
    companyLogoUrl: logoUrl || null,
    docTitle: "Credit Note",
    docNumber: creditNote.creditNoteNumber,
    docDate: formatEATDocDate(creditNote.issuedAt),
    terms: "Sales return / adjustment",
    dueDate: null,
    clientName: creditNote.sale.client?.fullName ?? "Walk-in",
    clientEmail: creditNote.sale.client?.email ?? null,
    clientPhone: creditNote.sale.client?.phone ?? null,
    clientLocation: creditNote.sale.client?.organization ?? null,
    lineItems,
    subTotal: formatMoney(creditNote.totalAmount, currency),
    totalLabel: "Credit Total",
    totalAmount: formatMoney(creditNote.totalAmount, currency),
    paymentMade: formatMoney(refundedTotal, currency),
    balanceDue: formatMoney(outstandingCredit, currency),
    notes: [
      `Sale: ${creditNote.sale.saleNumber}`,
      creditNote.reason ? `Reason: ${creditNote.reason}` : null,
      creditNote.itemsReceivedBackAt ? `Items received back: ${formatEATDocDate(creditNote.itemsReceivedBackAt)}` : "Items return pending",
      creditNote.itemsReceivedBackNote ? `Return note: ${creditNote.itemsReceivedBackNote}` : null,
    ].filter(Boolean).join("\n"),
    paymentTo: null,
    termsText: branding.termsText || null,
  });

  try {
    const pdf = await renderToBuffer(docElement as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="credit-note-${creditNote.creditNoteNumber}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: `Credit note PDF generation failed: ${message}` }, { status: 500 });
  }
}
