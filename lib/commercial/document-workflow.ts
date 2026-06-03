import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function nextDocumentNumber(tx: Tx, prefix: string, countModel: "quotation" | "invoice" | "deliveryNote" | "receipt" | "creditNote") {
  const year = new Date().getFullYear();
  const startsWith = `${prefix}-${year}-`;
  const numbers = countModel === "quotation"
    ? await tx.quotation.findMany({ where: { quoteNumber: { startsWith } }, select: { quoteNumber: true } })
    : countModel === "invoice"
      ? await tx.invoice.findMany({ where: { invoiceNumber: { startsWith } }, select: { invoiceNumber: true } })
      : countModel === "deliveryNote"
        ? await tx.deliveryNote.findMany({ where: { deliveryNoteNumber: { startsWith } }, select: { deliveryNoteNumber: true } })
        : countModel === "creditNote"
          ? await tx.creditNote.findMany({ where: { creditNoteNumber: { startsWith } }, select: { creditNoteNumber: true } })
          : await tx.receipt.findMany({ where: { receiptNumber: { startsWith } }, select: { receiptNumber: true } });
  const max = numbers.reduce((highest, record) => {
    const value = "quoteNumber" in record
      ? record.quoteNumber
      : "invoiceNumber" in record
        ? record.invoiceNumber
        : "deliveryNoteNumber" in record
          ? record.deliveryNoteNumber
          : "creditNoteNumber" in record
            ? record.creditNoteNumber
            : record.receiptNumber;
    const sequence = Number(value.slice(startsWith.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${startsWith}${String(max + 1).padStart(4, "0")}`;
}

export async function nextAvailableInvoiceNumber(tx: Tx, preferred?: string | null, excludeInvoiceId?: string | null) {
  const preferredNumber = preferred?.trim();
  if (preferredNumber) {
    const existing = await tx.invoice.findUnique({
      where: { invoiceNumber: preferredNumber },
      select: { id: true },
    });
    if (!existing || existing.id === excludeInvoiceId) {
      return preferredNumber;
    }
  }

  for (let attempts = 0; attempts < 20; attempts += 1) {
    const candidate = await nextDocumentNumber(tx, "INV", "invoice");
    const existing = await tx.invoice.findUnique({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeInvoiceId) {
      return candidate;
    }
  }

  throw new Error("Could not allocate a unique invoice number.");
}

function repairDescription(job: {
  jobNumber: string;
  brand: string;
  model: string;
  issueDescription: string;
  diagnosisNotes: string | null;
  recommendedRepair: string | null;
  partsNeeded: string | null;
}) {
  const details = [job.recommendedRepair, job.partsNeeded, job.diagnosisNotes, job.issueDescription]
    .filter(Boolean)
    .join(" | ");
  return `Repair for ${job.jobNumber} - ${job.brand} ${job.model}${details ? `: ${details}` : ""}`;
}

export async function ensureQuotationFromJob(tx: Tx, params: { orgId: string; jobId: string; userId: string; currency: string }) {
  const existing = await tx.quotation.findFirst({
    where: { orgId: params.orgId, jobId: params.jobId },
    include: { items: true },
  });
  if (existing) return existing;

  const job = await tx.job.findFirst({
    where: { id: params.jobId, orgId: params.orgId },
    select: {
      id: true,
      jobNumber: true,
      clientId: true,
      brand: true,
      model: true,
      issueDescription: true,
      diagnosisNotes: true,
      recommendedRepair: true,
      partsNeeded: true,
      clientBill: true,
    },
  });
  if (!job) return null;

  const totalAmount = job.clientBill ?? 0;
  const quoteNumber = await nextDocumentNumber(tx, "QT", "quotation");
  return tx.quotation.create({
    data: {
      orgId: params.orgId,
      quoteNumber,
      status: "DRAFT",
      currency: params.currency,
      clientId: job.clientId,
      jobId: job.id,
      subtotal: totalAmount,
      totalAmount,
      notes: `Converted from job card ${job.jobNumber}`,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdById: params.userId,
      items: {
        create: [{
          description: repairDescription(job),
          quantity: 1,
          unitPrice: totalAmount,
          lineTotal: totalAmount,
        }],
      },
    },
    include: { items: true },
  });
}

export async function ensureInvoiceFromQuotation(tx: Tx, params: { orgId: string; quotationId: string; currency: string }) {
  const quotation = await tx.quotation.findFirst({
    where: { id: params.quotationId, orgId: params.orgId },
    include: { items: true, job: { select: { id: true, jobNumber: true } } },
  });
  if (!quotation) return null;

  if (quotation.convertedToInvoiceId) {
    const existing = await tx.invoice.findFirst({ where: { id: quotation.convertedToInvoiceId, orgId: params.orgId } });
    if (existing) return existing;
  }

  if (quotation.jobId) {
    const existing = await tx.invoice.findFirst({ where: { jobId: quotation.jobId, orgId: params.orgId } });
    if (existing) {
      await tx.quotation.update({ where: { id: quotation.id }, data: { convertedToInvoiceId: existing.id } });
      return existing;
    }
  }

  const invoiceNumber = await nextAvailableInvoiceNumber(tx);
  const totalAmount = quotation.totalAmount;
  const invoice = await tx.invoice.create({
    data: {
      orgId: params.orgId,
      jobId: quotation.jobId,
      clientId: quotation.clientId,
      invoiceType: quotation.jobId ? "REPAIR" : "SERVICE",
      subject: quotation.job ? `Repair invoice for ${quotation.job.jobNumber}` : `Invoice from quotation ${quotation.quoteNumber}`,
      invoiceNumber,
      currency: quotation.currency || params.currency,
      status: "ISSUED",
      totalAmount,
      notes: `Converted from quotation ${quotation.quoteNumber}`,
      lines: {
        create: quotation.items.length > 0
          ? quotation.items.map((item) => ({
              orgId: params.orgId,
              sourceType: "QuotationItem",
              sourceId: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discount,
              lineTotal: item.lineTotal,
            }))
          : [{
              orgId: params.orgId,
              sourceType: "Quotation",
              sourceId: quotation.id,
              description: `Quotation ${quotation.quoteNumber}`,
              quantity: 1,
              unitPrice: totalAmount,
              lineTotal: totalAmount,
            }],
      },
    },
  });

  await tx.quotation.update({ where: { id: quotation.id }, data: { convertedToInvoiceId: invoice.id } });
  if (quotation.jobId) {
    await tx.job.updateMany({
      where: { id: quotation.jobId, orgId: params.orgId },
      data: { invoiceNumber, invoiceIssuedAt: new Date() },
    });
  }
  return invoice;
}

export async function createReceiptForPayment(tx: Tx, params: { orgId: string; paymentId: string; invoiceId?: string | null; saleId?: string | null; clientId?: string | null; amount: number; currency: string; issuedById?: string | null }) {
  const existing = await tx.receipt.findFirst({ where: { orgId: params.orgId, paymentId: params.paymentId } });
  if (existing) return existing;
  const receiptNumber = await nextDocumentNumber(tx, "RCT", "receipt");
  return tx.receipt.create({
    data: {
      orgId: params.orgId,
      receiptNumber,
      paymentId: params.paymentId,
      invoiceId: params.invoiceId ?? null,
      saleId: params.saleId ?? null,
      clientId: params.clientId ?? null,
      amount: params.amount,
      currency: params.currency,
      issuedById: params.issuedById ?? null,
    },
  });
}
