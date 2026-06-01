import { Prisma } from "@prisma/client";

import { nextDocumentNumber } from "@/lib/commercial/document-workflow";

type Tx = Prisma.TransactionClient;

type InvoiceLineInput = {
  sourceType?: string | null;
  sourceId?: string | null;
  description: string;
  quantity?: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
  lineTotal: number;
};

export async function replaceAccountingInvoiceLines({
  tx,
  orgId,
  invoiceId,
  lines,
}: {
  tx: Tx;
  orgId: string;
  invoiceId: string;
  lines: InvoiceLineInput[];
}) {
  try {
    await tx.invoiceLine.deleteMany({ where: { orgId, invoiceId } });
    if (lines.length === 0) return;

    await tx.invoiceLine.createMany({
      data: lines.map((line) => ({
        orgId,
        invoiceId,
        sourceType: line.sourceType ?? null,
        sourceId: line.sourceId ?? null,
        description: line.description,
        quantity: line.quantity ?? 1,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount ?? 0,
        taxAmount: line.taxAmount ?? 0,
        lineTotal: line.lineTotal,
      })),
    });
  } catch {
    // Commercial tables are additive; do not break legacy invoicing during staged rollout.
  }
}

export async function replaceDocumentTaxLines({
  tx,
  orgId,
  documentType,
  documentId,
  taxLabel,
  taxRate,
  taxableAmount,
  taxAmount,
}: {
  tx: Tx;
  orgId: string;
  documentType: string;
  documentId: string;
  taxLabel: string;
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
}) {
  try {
    await tx.documentTaxLine.deleteMany({ where: { orgId, documentType, documentId } });
    if (taxAmount <= 0) return;

    await tx.documentTaxLine.create({
      data: {
        orgId,
        documentType,
        documentId,
        taxLabel,
        taxRate,
        taxableAmount,
        taxAmount,
      },
    });
  } catch {
    // Optional accounting detail table; ignore when schema has not been deployed yet.
  }
}

export async function writePaymentAccountingDocuments({
  tx,
  orgId,
  paymentId,
  amount,
  currency,
  issuedById,
  saleId = null,
  invoiceId = null,
  branchId = null,
  targetType,
  targetId,
}: {
  tx: Tx;
  orgId: string;
  paymentId: string;
  amount: number;
  currency: string;
  issuedById?: string | null;
  saleId?: string | null;
  invoiceId?: string | null;
  branchId?: string | null;
  targetType: string;
  targetId: string;
}) {
  try {
    await tx.paymentAllocation.create({
      data: {
        orgId,
        paymentId,
        targetType,
        targetId,
        amount,
      },
    });

    const receiptNumber = await nextDocumentNumber(tx, "RCT", "receipt");

    await tx.receipt.create({
      data: {
        orgId,
        receiptNumber,
        paymentId,
        saleId,
        invoiceId,
        branchId,
        amount,
        currency,
        issuedById: issuedById ?? null,
      },
    });
  } catch {
    // Receipts/allocations are additive commercial records; keep payment capture non-blocking.
  }
}
