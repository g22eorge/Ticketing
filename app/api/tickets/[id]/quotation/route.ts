import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { nextDocumentNumber } from "@/lib/commercial/document-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, user } = await requireOrgSession();
    const { id: ticketId } = await params;
    const body = await request.json();

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      include: { client: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.quotationId) {
      return NextResponse.json({ error: "Ticket already has a quotation" }, { status: 409 });
    }

    const clientId = body.clientId ?? ticket.clientId ?? null;
    if (!clientId) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }

    const items: Array<{ description: string; quantity: number; unitPrice: number; discount: number }> = body.items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    const currency = body.currency ?? "UGX";
    const vatRate = body.vatRate ?? 0;

    const quotation = await prisma.$transaction(async (tx) => {
      const quoteNumber = await nextDocumentNumber(tx, "QT", "quotation");

      let subtotal = 0;
      const quotationItems = items.map((item) => {
        const lineTotal = item.quantity * item.unitPrice - item.discount;
        subtotal += lineTotal;
        return {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal,
        };
      });

      const vatAmount = subtotal * (vatRate / 100);
      const discountAmount = body.discountAmount ?? 0;
      const totalAmount = subtotal - discountAmount + vatAmount;

      const q = await tx.quotation.create({
        data: {
          orgId,
          quoteNumber,
          status: "DRAFT",
          currency,
          clientId,
          createdById: user.id,
          subtotal,
          discountAmount,
          vatAmount,
          taxLabel: vatRate > 0 ? `VAT (${vatRate}%)` : null,
          taxRate: vatRate > 0 ? vatRate : null,
          totalAmount,
          notes: body.notes ?? null,
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          items: {
            create: quotationItems,
          },
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: { quotationId: q.id },
      });

      return q;
    });

    return NextResponse.json({ success: true, quotation }, { status: 201 });
  } catch (error) {
    console.error("[TicketQuotationAPI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
