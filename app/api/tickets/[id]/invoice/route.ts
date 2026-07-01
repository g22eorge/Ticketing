import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { nextAvailableInvoiceNumber } from "@/lib/commercial/document-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgSession();
    const { id: ticketId } = await params;
    const body = await request.json();

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, orgId },
      include: { client: true, quotation: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.invoiceId) {
      return NextResponse.json({ error: "Ticket already has an invoice" }, { status: 409 });
    }

    const clientId = body.clientId ?? ticket.clientId ?? null;
    if (!clientId) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }

    const items: Array<{ description: string; quantity: number; unitPrice: number; discountAmount: number; taxAmount: number }> = body.items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    const currency = body.currency ?? "UGX";

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextAvailableInvoiceNumber(tx);

      let totalAmount = 0;
      const invoiceLines = items.map((item) => {
        const lineTotal = item.quantity * item.unitPrice - item.discountAmount;
        totalAmount += lineTotal + item.taxAmount;
        return {
          orgId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          lineTotal,
        };
      });

      const inv = await tx.invoice.create({
        data: {
          orgId,
          invoiceNumber,
          status: "ISSUED",
          currency,
          invoiceType: "SERVICE",
          clientId,
          totalAmount,
          paidAmount: 0,
          notes: body.notes ?? null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          lines: {
            create: invoiceLines,
          },
        },
      });

      await tx.ticket.update({
        where: { id: ticketId },
        data: { invoiceId: inv.id },
      });

      if (ticket.quotationId && ticket.quotation?.status !== "ACCEPTED") {
        await tx.quotation.update({
          where: { id: ticket.quotationId },
          data: { status: "ACCEPTED", acceptedAt: new Date(), convertedToInvoiceId: inv.id },
        });
      }

      return inv;
    });

    return NextResponse.json({ success: true, invoice }, { status: 201 });
  } catch (error) {
    console.error("[TicketInvoiceAPI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
