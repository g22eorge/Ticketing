import { revalidatePath } from "next/cache";

import { nextDocumentNumber } from "@/lib/commercial/document-workflow";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";

export type CreateQuotationInput = {
  leadId?: string;
  clientId?: string;
  jobId?: string;
  validUntil?: string;
  notes?: string;
  items: Array<{
    partId?: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
};

function quotationLineTotal(item: { quantity: number; unitPrice: number; discount: number }) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100);
}

export async function createQuotationRecord(data: CreateQuotationInput) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) {
    throw new Error("Unauthorized");
  }
  if (!data.leadId && !data.clientId && !data.jobId) {
    throw new Error("Choose a lead, client, or job for this quotation");
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("Add at least one quotation item");
  }

  const items = data.items.map((item) => {
    const partId = item.partId ? String(item.partId).trim() : null;
    const description = String(item.description ?? "").trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const requestedDiscount = Number(item.discount);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Each quotation item needs a description, quantity, and valid price");
    }
    if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > 100) {
      throw new Error("Discount must be between 0 and 100");
    }
    const discount = can.overrideDiscount(user) ? requestedDiscount : 0;
    return { partId, description, quantity, unitPrice, discount, lineTotal: quotationLineTotal({ quantity, unitPrice, discount }) };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const currency = (process.env.APP_CURRENCY ?? "UGX").toUpperCase().trim() || "UGX";
  const partIds = [...new Set(items.map((item) => item.partId).filter((partId): partId is string => Boolean(partId)))];
  if (partIds.length) {
    const validParts = await prisma.part.findMany({
      where: { id: { in: partIds }, orgId, isActive: true },
      select: { id: true },
    });
    if (validParts.length !== partIds.length) throw new Error("One or more quoted products are inactive or not found");
  }

  if (data.leadId) {
    const lead = await prisma.lead.findFirst({
      where: {
        id: data.leadId,
        orgId,
        ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
      },
      select: { id: true },
    });
    if (!lead) throw new Error("Lead not found");
  }

  let clientId = data.clientId || null;
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, orgId }, select: { id: true } });
    if (!client) throw new Error("Client not found");
  }
  if (data.jobId) {
    const job = await prisma.job.findFirst({
      where: {
        id: data.jobId,
        orgId,
        ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
      },
      select: { id: true, clientId: true },
    });
    if (!job) throw new Error("Job not found");
    clientId = clientId || job.clientId;
  }

  const quotation = await prisma.$transaction(async (tx) => {
    const quoteNumber = await nextDocumentNumber(tx, "QT", "quotation");
    return tx.quotation.create({
      data: {
        quoteNumber,
        orgId,
        leadId: data.leadId || null,
        clientId,
        jobId: data.jobId || null,
        createdById: user.id,
        status: "DRAFT",
        subtotal,
        totalAmount: subtotal,
        currency,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes ? sanitizeText(data.notes) : null,
        items: {
          create: items.map((item) => ({
            partId: item.partId,
            description: sanitizeText(item.description),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath("/documents/quotations");
  return quotation;
}
