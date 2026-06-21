"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { QuotationStatus, InvoiceStatus, PaymentMethod } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { ensureInvoiceFromQuotation, nextDocumentNumber } from "@/lib/commercial/document-workflow";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { recalculateQuotationTotals } from "@/app/(app)/sales/actions";

export async function documentAction(formData: FormData) {
  const action = String(formData.get("action") ?? "");
  const id = String(formData.get("id") ?? "");
  const { user, orgId, org } = await requireOrgSession();

  switch (action) {
    // ── Quotation ──
    case "quotation-send": {
      if (!can.createQuotations(user)) break;
      await prisma.quotation.updateMany({
        where: { id, orgId, status: "DRAFT" },
        data: { status: "SENT" as QuotationStatus, sentAt: new Date() },
      });
      // also allow re-sending a SENT quotation (no-op status-wise, but logs audit)
      await prisma.quotation.updateMany({
        where: { id, orgId, status: "SENT" },
        data: { sentAt: new Date() },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: id, action: "QUOTATION_SENT", summary: "Quotation sent to client" });
      revalidatePath("/documents/quotations");
      break;
    }
    case "quotation-approve": {
      if (!can.approveQuotations(user)) break;
      await prisma.quotation.updateMany({
        where: { id, orgId, status: "SENT" },
        data: { status: "ACCEPTED" as QuotationStatus, acceptedAt: new Date(), approvedById: user.id },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: id, action: "QUOTATION_APPROVED", summary: "Quotation approved" });
      revalidatePath("/documents/quotations");
      break;
    }
    case "quotation-reject": {
      if (!can.createQuotations(user)) break;
      await prisma.quotation.updateMany({
        where: { id, orgId, status: "SENT" },
        data: { status: "REJECTED" as QuotationStatus, rejectedAt: new Date() },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: id, action: "QUOTATION_REJECTED", summary: "Quotation rejected" });
      revalidatePath("/documents/quotations");
      break;
    }
    case "quotation-convert": {
      if (!can.createInvoices(user)) break;
      const quotation = await prisma.quotation.findFirst({
        where: { id, orgId, convertedToInvoiceId: null },
        select: { id: true, status: true },
      });
      if (!quotation) break;

      if (quotation.status === "DRAFT") {
        await prisma.quotation.updateMany({
          where: { id, orgId, status: "DRAFT" },
          data: { status: "ACCEPTED" as QuotationStatus, acceptedAt: new Date(), approvedById: user.id },
        });
        await recalculateQuotationTotals(id);
        await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: id, action: "QUOTATION_AUTO_APPROVED", summary: "Quotation auto-approved for conversion" });
      }

      const invoice = await prisma.$transaction(async (tx) => (
        ensureInvoiceFromQuotation(tx, { orgId, quotationId: id, currency: org.baseCurrency || "UGX" })
      ));
      if (invoice) {
        await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: invoice.id, action: "QUOTATION_CONVERTED_TO_INVOICE", summary: `Quotation converted to ${invoice.invoiceNumber}` });
        revalidatePath("/documents/invoices");
        revalidatePath("/documents/quotations");
        redirect("/documents/invoices");
      }
      break;
    }
    case "quotation-delete": {
      if (!can.createQuotations(user)) break;
      const draft = await prisma.quotation.findFirst({ where: { id, orgId, status: "DRAFT" }, select: { id: true } });
      if (!draft) break;
      await prisma.quotation.delete({ where: { id } });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: id, action: "QUOTATION_DELETED", summary: "Draft quotation deleted" });
      revalidatePath("/documents/quotations");
      break;
    }
    case "quotation-duplicate": {
      if (!can.createQuotations(user)) break;
      const original = await prisma.quotation.findFirst({ where: { id, orgId }, include: { items: true } });
      if (!original) break;
      const quoteNumber = await prisma.$transaction((tx) => nextDocumentNumber(tx, "QT", "quotation"));
      const dup = await prisma.quotation.create({
        data: {
          orgId,
          quoteNumber,
          status: "DRAFT" as QuotationStatus,
          currency: original.currency,
          clientId: original.clientId,
          leadId: original.leadId,
          jobId: original.jobId,
          subtotal: original.subtotal,
          discountAmount: original.discountAmount,
          vatAmount: original.vatAmount,
          taxLabel: original.taxLabel,
          taxRate: original.taxRate,
          totalAmount: original.totalAmount,
          notes: original.notes ? `Copy of ${original.quoteNumber}: ${original.notes}` : `Copy of ${original.quoteNumber}`,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdById: user.id,
          items: {
            create: original.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              lineTotal: item.lineTotal,
            })),
          },
        },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: dup.id, action: "QUOTATION_DUPLICATED", summary: `Duplicated from ${original.quoteNumber}` });
      revalidatePath("/documents/quotations");
      break;
    }

    // ── Invoice ──
    case "invoice-send": {
      if (!can.createInvoices(user)) break;
      const inv = await prisma.invoice.findFirst({ where: { id, orgId }, select: { id: true, status: true } });
      if (!inv) break;
      if (inv.status === "DRAFT") {
        await prisma.invoice.update({ where: { id, orgId }, data: { status: "ISSUED" as InvoiceStatus } });
      }
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: id, action: "INVOICE_SENT", summary: "Invoice sent/issued" });
      revalidatePath("/documents/invoices");
      break;
    }
    case "invoice-mark-paid": {
      if (!can.approveInvoices(user)) break;
      const inv = await prisma.invoice.findFirst({
        where: { id, orgId },
        select: { totalAmount: true, currency: true, clientId: true, invoiceNumber: true, ticket: { select: { id: true, ticketNumber: true } } },
      });
      if (!inv) break;
      const ticketId = inv.ticket?.id ?? null;
      const ticketNumber = inv.ticket?.ticketNumber ?? null;
      await prisma.$transaction(async (tx) => {
        const result = await tx.invoice.updateMany({
          where: { id, orgId, status: { in: ["DRAFT", "ISSUED"] } },
          data: { status: "PAID" as InvoiceStatus, paidAt: new Date(), paidAmount: inv.totalAmount },
        });
        if (result.count === 0) return;

        const existingReceipt = await tx.receipt.findFirst({ where: { invoiceId: id } });
        if (existingReceipt) return;

        if (ticketId) {
          const ticketReceipt = await tx.receipt.findFirst({ where: { ticketId } });
          if (ticketReceipt) {
            await tx.receipt.update({ where: { id: ticketReceipt.id }, data: { invoiceId: id } });
            return;
          }
        }

        const receiptNumber = await nextDocumentNumber(tx, "RCT", "receipt");

        const payment = await tx.payment.create({
          data: {
            orgId,
            invoiceId: id,
            amount: inv.totalAmount,
            currency: inv.currency,
            method: "CASH" as PaymentMethod,
            createdById: user.id,
            note: ticketNumber ? `Payment for ticket ${ticketNumber}` : `Payment for invoice ${inv.invoiceNumber}`,
          },
        });

        await tx.receipt.create({
          data: {
            orgId,
            receiptNumber,
            paymentId: payment.id,
            invoiceId: id,
            ticketId,
            clientId: inv.clientId ?? null,
            amount: inv.totalAmount,
            currency: inv.currency,
            issuedById: user.id,
          },
        });
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: id, action: "INVOICE_MARKED_PAID", summary: "Invoice marked as paid" });
      revalidatePath("/documents/invoices");
      revalidatePath("/documents/receipts");
      break;
    }
    case "invoice-void": {
      if (!can.voidInvoices(user)) break;
      await prisma.invoice.updateMany({
        where: { id, orgId, status: { in: ["DRAFT", "ISSUED"] } },
        data: { status: "VOID" as InvoiceStatus },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: id, action: "INVOICE_VOIDED", summary: "Invoice voided" });
      revalidatePath("/documents/invoices");
      break;
    }
    case "invoice-delete-draft": {
      if (!can.createInvoices(user)) break;
      const draft = await prisma.invoice.findFirst({ where: { id, orgId, status: "DRAFT" }, select: { id: true } });
      if (!draft) break;
      await prisma.invoice.delete({ where: { id } });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: id, action: "INVOICE_DELETED", summary: "Draft invoice deleted" });
      revalidatePath("/documents/invoices");
      break;
    }
    case "invoice-duplicate": {
      if (!can.createInvoices(user)) break;
      const original = await prisma.invoice.findFirst({ where: { id, orgId }, include: { lines: true } });
      if (!original) break;
      const invoiceNumber = await prisma.$transaction((tx) => nextDocumentNumber(tx, "INV", "invoice"));
      const dup = await prisma.invoice.create({
        data: {
          orgId,
          invoiceNumber,
          currency: original.currency,
          status: "DRAFT" as InvoiceStatus,
          invoiceType: original.invoiceType,
          subject: original.subject,
          clientId: original.clientId,
          totalAmount: original.totalAmount,
          notes: original.notes ? `Copy of ${original.invoiceNumber}: ${original.notes}` : `Copy of ${original.invoiceNumber}`,
          lines: {
            create: original.lines.map((line) => ({
              orgId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            })),
          },
        },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: dup.id, action: "INVOICE_DUPLICATED", summary: `Duplicated from ${original.invoiceNumber}` });
      revalidatePath("/documents/invoices");
      break;
    }

    // ── Receipt ──
    case "receipt-send": {
      if (!can.viewFinancials(user)) break;
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Receipt", entityId: id, action: "RECEIPT_SENT", summary: "Receipt sent to client" });
      revalidatePath("/documents/receipts");
      break;
    }
    case "receipt-void": {
      if (user.role !== "ADMIN" && user.role !== "FINANCE" && !can.voidInvoices(user)) break;
      await prisma.receipt.updateMany({
        where: { id, orgId, voidedAt: null },
        data: { voidedAt: new Date(), voidReason: "Voided by user" },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Receipt", entityId: id, action: "RECEIPT_VOIDED", summary: "Receipt voided" });
      revalidatePath("/documents/receipts");
      break;
    }
    case "receipt-duplicate": {
      if (!can.viewFinancials(user)) break;
      const original = await prisma.receipt.findFirst({ where: { id, orgId } });
      if (!original) break;
      const receiptNumber = await prisma.$transaction((tx) => nextDocumentNumber(tx, "RCT", "receipt"));
      const dup = await prisma.receipt.create({
        data: {
          orgId,
          receiptNumber,
          paymentId: null,
          invoiceId: original.invoiceId,
          saleId: original.saleId,
          clientId: original.clientId,
          amount: original.amount,
          currency: original.currency,
          issuedById: user.id,
        },
      });
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Receipt", entityId: dup.id, action: "RECEIPT_DUPLICATED", summary: `Reissued from ${original.receiptNumber}` });
      revalidatePath("/documents/receipts");
      break;
    }
  }

  revalidatePath("/documents/quotations");
  revalidatePath("/documents/invoices");
  revalidatePath("/documents/receipts");
}
