import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { requireOrgSession } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { nextDocumentNumber } from "@/lib/commercial/document-workflow";

const PAYMENT_METHODS = new Set(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"]);

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
      include: { client: true, invoice: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const existingReceipt = await prisma.receipt.findFirst({ where: { ticketId } });
    if (existingReceipt) {
      return NextResponse.json({ error: "Ticket already has a receipt" }, { status: 409 });
    }

    const amount = parseFloat(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const currency = body.currency ?? "UGX";
    const rawMethod = String(body.method ?? "CASH").toUpperCase();
    const method = (PAYMENT_METHODS.has(rawMethod) ? rawMethod : "CASH") as PaymentMethod;
    const reference = body.reference ?? null;
    const clientId = body.clientId ?? ticket.clientId ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const receiptNumber = await nextDocumentNumber(tx, "RCT", "receipt");

      const payment = await tx.payment.create({
        data: {
          orgId,
          invoiceId: ticket.invoiceId ?? null,
          amount,
          currency,
          method,
          reference,
          createdById: user.id,
          note: `Payment for ticket ${ticket.ticketNumber}`,
        },
      });

      const r = await tx.receipt.create({
        data: {
          orgId,
          receiptNumber,
          paymentId: payment.id,
          currency,
          amount,
          clientId,
          invoiceId: ticket.invoiceId ?? null,
          ticketId,
          issuedById: user.id,
        },
      });

      if (ticket.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: ticket.invoiceId } });
        if (invoice) {
          const newPaidAmount = invoice.paidAmount + amount;
          const isPaid = newPaidAmount >= invoice.totalAmount;
          await tx.invoice.update({
            where: { id: ticket.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              paidAt: isPaid ? new Date() : invoice.paidAt,
              status: isPaid ? "PAID" : "ISSUED",
            },
          });
        }
      }

      return { receipt: r, payment };
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    console.error("[TicketReceiptAPI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
