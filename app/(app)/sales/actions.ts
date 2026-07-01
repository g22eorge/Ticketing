"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LeadSource, LeadStatus, QuotationStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";
import { notifyLeadStatus, notifyQuotationStatus } from "@/lib/notifications";
import { createQuotationRecord, type CreateQuotationInput } from "@/lib/sales/quotation-service";

const createLeadSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(3),
  email: z.string().optional(),
  organization: z.string().optional(),
  interest: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
  estimatedValue: z.coerce.number().optional(),
  followUpAt: z.string().optional(),
});

const updateLeadDetailsSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(3),
  email: z.string().optional(),
  organization: z.string().optional(),
  interest: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  estimatedValue: z.coerce.number().optional(),
  followUpAt: z.string().optional(),
  assignedToId: z.string().optional(),
});

export async function createLead(data: {
  fullName: string;
  phone: string;
  email?: string;
  organization?: string;
  interest?: string;
  source?: string;
  notes?: string;
  assignedToId?: string;
  estimatedValue?: number;
  followUpAt?: string;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = createLeadSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: parsed.data.assignedToId, orgId }, select: { id: true } });
    if (!assignee) throw new Error("Assigned user not found");
  }

  const lead = await prisma.lead.create({
    data: {
      fullName: sanitizeText(parsed.data.fullName),
      orgId,
      phone: sanitizeText(parsed.data.phone),
      email: sanitizeOptionalText(parsed.data.email),
      organization: sanitizeOptionalText(parsed.data.organization),
      interest: sanitizeOptionalText(parsed.data.interest),
      source: (parsed.data.source as Parameters<typeof prisma.lead.create>[0]["data"]["source"]) ?? "WALK_IN",
      notes: sanitizeOptionalText(parsed.data.notes),
      assignedToId: parsed.data.assignedToId || null,
      estimatedValue: parsed.data.estimatedValue ?? null,
      followUpAt: parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null,
      createdById: user.id,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: user.id,
      type: "NOTE",
      note: "Lead created",
    },
  });

  revalidatePath("/sales");
  return lead;
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, note?: string, lostReason?: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const leadAccessWhere = {
    id: leadId,
    orgId,
    ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
  };

  const existing = await prisma.lead.findFirst({ where: leadAccessWhere, select: { status: true, fullName: true } });
  if (!existing) throw new Error("Lead not found");

  await prisma.lead.updateMany({
    where: leadAccessWhere,
    data: {
      status,
      ...(status === "WON"
        ? { convertedAt: new Date(), closedAt: null, lostReason: null }
        : status === "LOST"
          ? { convertedAt: null, closedAt: new Date(), lostReason: lostReason ? sanitizeText(lostReason) : null }
          : status === "STALE"
            ? { convertedAt: null, closedAt: new Date(), lostReason: null }
            : { convertedAt: null, closedAt: null, lostReason: null }),
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: user.id,
      type: "STATUS_CHANGE",
      note: note ? sanitizeText(note) : `Status changed to ${status}`,
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales");
  if (status === "WON" || status === "LOST") {
    notifyLeadStatus({
      orgId,
      leadTitle: existing.fullName,
      status,
      actorName: user.name ?? user.email ?? "Unknown",
    }).catch(() => {});
  }
}

export async function updateLeadDetails(
  leadId: string,
  data: {
    fullName: string;
    phone: string;
    email?: string;
    organization?: string;
    interest?: string;
    source?: string;
    notes?: string;
    estimatedValue?: number;
    followUpAt?: string;
    assignedToId?: string;
  },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = updateLeadDetailsSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const leadAccessWhere = {
    id: leadId,
    orgId,
    ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
  };

  const existing = await prisma.lead.findFirst({ where: leadAccessWhere, select: { id: true } });
  if (!existing) throw new Error("Lead not found");

  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: parsed.data.assignedToId, orgId }, select: { id: true } });
    if (!assignee) throw new Error("Assigned user not found");
  }

  const validSources: LeadSource[] = ["WALK_IN", "REFERRAL", "PHONE", "SOCIAL_MEDIA", "WEBSITE", "OTHER"];
  const source = validSources.includes(parsed.data.source as LeadSource)
    ? parsed.data.source as LeadSource
    : "WALK_IN";
  const followUpAt = parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null;

  await prisma.lead.updateMany({
    where: leadAccessWhere,
    data: {
      fullName: sanitizeText(parsed.data.fullName),
      phone: sanitizeText(parsed.data.phone),
      email: sanitizeOptionalText(parsed.data.email),
      organization: sanitizeOptionalText(parsed.data.organization),
      interest: sanitizeOptionalText(parsed.data.interest),
      source,
      notes: sanitizeOptionalText(parsed.data.notes),
      estimatedValue: parsed.data.estimatedValue ?? null,
      followUpAt: followUpAt && !Number.isNaN(followUpAt.getTime()) ? followUpAt : null,
      assignedToId: parsed.data.assignedToId ?? undefined,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: user.id,
      type: "NOTE",
      note: "Lead details updated",
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales");
}

// Quick-advance action used by inline forms in the lead list
export async function advanceLeadStageAction(formData: FormData) {
  const leadId    = String(formData.get("leadId") ?? "").trim();
  const newStatus = String(formData.get("newStatus") ?? "").trim() as LeadStatus;
  const reason    = String(formData.get("lostReason") ?? "").trim() || undefined;
  if (!leadId || !newStatus) return;
  await updateLeadStatus(leadId, newStatus, undefined, reason);
}

export async function addLeadActivity(
  leadId: string,
  activity: { type: string; note: string },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      orgId,
      ...(!can.viewAllSales(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
    },
    select: { id: true },
  });
  if (!lead) throw new Error("Lead not found");

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: user.id,
      type: activity.type,
      note: sanitizeText(activity.note),
    },
  });

  revalidatePath(`/sales/leads/${leadId}`);
}

function quotationLineTotal(item: { quantity: number; unitPrice: number; discount: number }) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100);
}

export async function recalculateQuotationTotals(quotationId: string) {
  const [items, quotation] = await Promise.all([
    prisma.quotationItem.findMany({ where: { quotationId } }),
    prisma.quotation.findUnique({ where: { id: quotationId }, select: { subtotal: true, vatAmount: true, taxRate: true } }),
  ]);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const inferredTaxRate = quotation?.taxRate ?? (
    quotation && quotation.subtotal > 0 && quotation.vatAmount > 0
      ? (quotation.vatAmount / quotation.subtotal) * 100
      : 0
  );
  const vatAmount = inferredTaxRate > 0 ? subtotal * (inferredTaxRate / 100) : 0;
  await prisma.quotation.update({
    where: { id: quotationId },
    data: { subtotal, vatAmount, totalAmount: subtotal + vatAmount },
  });
}

async function assertEditableQuotation(quotationId: string, orgId: string, user: Awaited<ReturnType<typeof requireOrgSession>>["user"]) {
  const quote = await prisma.quotation.findFirst({
    where: {
      id: quotationId,
      orgId,
      status: "DRAFT",
      convertedToInvoiceId: null,
      ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
    },
    select: { id: true },
  });
  if (!quote) throw new Error("Draft quotation not found");
  return quote;
}

export async function createQuotation(data: CreateQuotationInput) {
  const quotation = await createQuotationRecord(data);
  redirect(`/sales/quotations/${quotation.id}`);
}

export async function updateQuotationStatus(quotationId: string, status: QuotationStatus) {
  const { user, orgId } = await requireOrgSession();

  if (status === "SENT") {
    if (!can.createQuotations(user)) throw new Error("Unauthorized");
  } else if (status === "ACCEPTED") {
    if (!can.approveQuotations(user)) throw new Error("Unauthorized");
  } else {
    if (!can.createQuotations(user)) throw new Error("Unauthorized");
  }

  const accessWhere = {
    id: quotationId,
    orgId,
    ...(status === "ACCEPTED" || can.viewAllSales(user) ? {} : { createdById: user.id }),
  };
  const quotation = await prisma.quotation.findFirst({
    where: accessWhere,
    select: { id: true, leadId: true, quoteNumber: true, lead: { select: { fullName: true } } },
  });
  if (!quotation) throw new Error("Quotation not found");

  const now = new Date();
  const result = await prisma.quotation.updateMany({
    where: accessWhere,
    data: {
      status,
      ...(status === "SENT" ? { sentAt: now } : {}),
      ...(status === "ACCEPTED" ? { acceptedAt: now, approvedById: user.id } : {}),
      ...(status === "REJECTED" ? { rejectedAt: now } : {}),
    },
  });
  if (result.count === 0) throw new Error("Quotation not found");

  if (quotation.leadId) {
    if (status === "SENT") {
      await prisma.lead.updateMany({
        where: { id: quotation.leadId, orgId, status: { notIn: ["WON", "LOST", "STALE"] } },
        data: { status: "PROPOSAL_SENT" },
      });
      await prisma.leadActivity.create({
        data: { leadId: quotation.leadId, userId: user.id, type: "STATUS_CHANGE", note: "Quotation sent" },
      });
    }
    if (status === "ACCEPTED") {
      await prisma.lead.updateMany({
        where: { id: quotation.leadId, orgId },
        data: { status: "WON", convertedAt: now, closedAt: null, lostReason: null },
      });
      await prisma.leadActivity.create({
        data: { leadId: quotation.leadId, userId: user.id, type: "STATUS_CHANGE", note: "Quotation accepted" },
      });
    }
  }

  revalidatePath(`/sales/quotations/${quotationId}`);
  if (quotation.leadId) revalidatePath(`/sales/leads/${quotation.leadId}`);
  revalidatePath("/sales");
  if (status === "ACCEPTED" || status === "REJECTED") {
    notifyQuotationStatus({
      orgId,
      quotationRef: quotation.quoteNumber ?? quotationId,
      status,
      clientName: quotation.lead?.fullName ?? "Client",
      actorName: user.name ?? user.email ?? "Unknown",
    }).catch(() => {});
  }
}

export async function addQuotationItem(
  quotationId: string,
  item: { description: string; quantity: number; unitPrice: number; discount: number },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  await assertEditableQuotation(quotationId, orgId, user);
  const discount = can.overrideDiscount(user) ? item.discount : 0;
  const lineTotal = quotationLineTotal({ ...item, discount });

  await prisma.quotationItem.create({
    data: {
      quotationId,
      description: sanitizeText(item.description),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount,
      lineTotal,
    },
  });

  await recalculateQuotationTotals(quotationId);

  revalidatePath(`/sales/quotations/${quotationId}`);
}

export async function updateQuotationDetails(
  quotationId: string,
  data: { validUntil?: string; notes?: string },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  await assertEditableQuotation(quotationId, orgId, user);

  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      notes: sanitizeOptionalText(data.notes),
    },
  });

  revalidatePath(`/sales/quotations/${quotationId}`);
  revalidatePath("/sales");
}

export async function updateQuotationItem(
  itemId: string,
  item: { description: string; quantity: number; unitPrice: number; discount: number },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const existing = await prisma.quotationItem.findFirst({
    where: { id: itemId, quotation: { orgId } },
    select: { quotationId: true, quotation: { select: { createdById: true, status: true, convertedToInvoiceId: true } } },
  });
  if (!existing) throw new Error("Quotation item not found");
  await assertEditableQuotation(existing.quotationId, orgId, user);

  const discount = can.overrideDiscount(user) ? item.discount : 0;
  const lineTotal = quotationLineTotal({ ...item, discount });

  await prisma.quotationItem.update({
    where: { id: itemId },
    data: {
      description: sanitizeText(item.description),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount,
      lineTotal,
    },
  });

  await recalculateQuotationTotals(existing.quotationId);
  revalidatePath(`/sales/quotations/${existing.quotationId}`);
}

export async function removeQuotationItem(itemId: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const item = await prisma.quotationItem.findFirst({
    where: { id: itemId, quotation: { orgId, ...(!can.viewAllSales(user) ? { createdById: user.id } : {}) } },
    select: { quotationId: true },
  });
  if (!item) return;
  await assertEditableQuotation(item.quotationId, orgId, user);

  await prisma.quotationItem.delete({ where: { id: itemId } });
  await recalculateQuotationTotals(item.quotationId);

  revalidatePath(`/sales/quotations/${item.quotationId}`);
}

export async function deleteQuotation(quotationId: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  await assertEditableQuotation(quotationId, orgId, user);
  await prisma.quotation.delete({ where: { id: quotationId } });

  revalidatePath("/sales");
  redirect("/sales?tab=quotations");
}
