import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { formatMoney } from "@/lib/currency";
import { formatEATDocDate } from "@/lib/date-eat";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { EagleInfoDocument, type EagleInfoLineItem } from "@/lib/pdf/EagleInfoDocument";
import { resolveInvoiceLogo, prettyEnum } from "@/lib/pdf/pdf-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, orgId } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const refund = await prisma.refund.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      reference: true,
      note: true,
      refundedAt: true,
      invoice: {
        select: {
          invoiceNumber: true,
          client: { select: { fullName: true, phone: true, email: true, organization: true } },
          job: {
            select: {
              jobNumber: true,
              client: { select: { fullName: true, phone: true, email: true, organization: true } },
            },
          },
        },
      },
      sale: {
        select: {
          saleNumber: true,
          client: { select: { fullName: true, phone: true, email: true, organization: true } },
        },
      },
      creditNote: {
        select: {
          creditNoteNumber: true,
          sale: { select: { client: { select: { fullName: true, phone: true, email: true, organization: true } } } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!refund) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branding = await getDocumentBrandingSettings(orgId);
  const logoUrl = await resolveInvoiceLogo(branding?.companyLogoUrl);
  const address = [branding.companyAddressLine1, branding.companyAddressLine2].filter(Boolean).join(", ");
  const recipient = refund.invoice?.job?.client
    ?? refund.invoice?.client
    ?? refund.sale?.client
    ?? refund.creditNote?.sale.client
    ?? null;
  const source = refund.invoice?.invoiceNumber
    ?? refund.sale?.saleNumber
    ?? refund.creditNote?.creditNoteNumber
    ?? "Refund";
  const refundNumber = `REF-${refund.id.slice(0, 8).toUpperCase()}`;
  const lineItems: EagleInfoLineItem[] = [{
    name: `Refund issued against ${source}`,
    sku: refund.reference ? `Reference: ${refund.reference}` : null,
    quantity: 1,
    rate: formatMoney(refund.amount, refund.currency),
    amount: formatMoney(refund.amount, refund.currency),
  }];

  const docElement = createElement(EagleInfoDocument, {
    companyName: branding.companyName,
    companyAddress: address,
    companyPhone: branding.companyContacts || null,
    companyEmail: branding.companyEmail || null,
    companyLogoUrl: logoUrl || null,
    docTitle: "Refund",
    docNumber: refundNumber,
    docDate: formatEATDocDate(refund.refundedAt),
    terms: prettyEnum(refund.method),
    dueDate: null,
    clientName: recipient?.fullName ?? "Walk-in",
    clientEmail: recipient?.email ?? null,
    clientPhone: recipient?.phone ?? null,
    clientLocation: recipient?.organization ?? null,
    lineItems,
    subTotal: formatMoney(refund.amount, refund.currency),
    totalLabel: "Refund Total",
    totalAmount: formatMoney(refund.amount, refund.currency),
    paymentMade: formatMoney(refund.amount, refund.currency),
    balanceDue: formatMoney(0, refund.currency),
    notes: [
      `Source: ${source}`,
      refund.creditNote?.creditNoteNumber ? `Credit note: ${refund.creditNote.creditNoteNumber}` : null,
      refund.reference ? `Reference: ${refund.reference}` : null,
      refund.note,
      refund.createdBy?.name ? `Issued by: ${refund.createdBy.name}` : null,
    ].filter(Boolean).join("\n"),
    paymentTo: null,
    termsText: "Refund issued and recorded in the finance ledger.",
  });

  try {
    const pdf = await renderToBuffer(docElement as never);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="refund-${refundNumber}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF generation error";
    return NextResponse.json({ error: `Refund PDF generation failed: ${message}` }, { status: 500 });
  }
}
