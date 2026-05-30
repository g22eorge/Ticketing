"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LeadStatus, QuotationStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { requireOrgSession } from "@/lib/org-context";

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

  const existing = await prisma.lead.findFirst({ where: leadAccessWhere, select: { status: true } });
  if (!existing) throw new Error("Lead not found");

  await prisma.lead.updateMany({
    where: leadAccessWhere,
    data: {
      status,
      ...(status === "WON" ? { convertedAt: new Date() } : {}),
      ...(status === "LOST" || status === "STALE" ? { closedAt: new Date() } : {}),
      ...(status === "LOST" && lostReason ? { lostReason } : {}),
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

async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quotation.count();
  return `QT-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function createQuotation(data: {
  leadId?: string;
  clientId?: string;
  jobId?: string;
  validUntil?: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) {
    throw new Error("Unauthorized");
  }

  const items = data.items.map((item) => {
    const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);
    return { ...item, lineTotal };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const quoteNumber = await generateQuoteNumber();

  const currency = (process.env.APP_CURRENCY ?? "UGX").toUpperCase().trim() || "UGX";
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
  if (data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: data.clientId, orgId }, select: { id: true } });
    if (!client) throw new Error("Client not found");
  }
  if (data.jobId) {
    const job = await prisma.job.findFirst({ where: { id: data.jobId, orgId }, select: { id: true } });
    if (!job) throw new Error("Job not found");
  }

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
      orgId,
      leadId: data.leadId || null,
      clientId: data.clientId || null,
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
          description: sanitizeText(item.description),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal,
        })),
      },
    },
  });

  revalidatePath("/sales");
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

  const now = new Date();
  const result = await prisma.quotation.updateMany({
    where: { id: quotationId, orgId, ...(status === "ACCEPTED" || can.viewAllSales(user) ? {} : { createdById: user.id }) },
    data: {
      status,
      ...(status === "SENT" ? { sentAt: now } : {}),
      ...(status === "ACCEPTED" ? { acceptedAt: now, approvedById: user.id } : {}),
      ...(status === "REJECTED" ? { rejectedAt: now } : {}),
    },
  });
  if (result.count === 0) throw new Error("Quotation not found");

  revalidatePath(`/sales/quotations/${quotationId}`);
  revalidatePath("/sales");
}

export async function addQuotationItem(
  quotationId: string,
  item: { description: string; quantity: number; unitPrice: number; discount: number },
) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);

  const quote = await prisma.quotation.findFirst({
    where: { id: quotationId, orgId, ...(!can.viewAllSales(user) ? { createdById: user.id } : {}) },
    select: { id: true },
  });
  if (!quote) throw new Error("Quotation not found");

  await prisma.quotationItem.create({
    data: {
      quotationId,
      description: sanitizeText(item.description),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal,
    },
  });

  const items = await prisma.quotationItem.findMany({ where: { quotationId } });
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { subtotal, totalAmount: subtotal },
  });

  revalidatePath(`/sales/quotations/${quotationId}`);
}

export async function removeQuotationItem(itemId: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const item = await prisma.quotationItem.findFirst({
    where: { id: itemId, quotation: { orgId, ...(!can.viewAllSales(user) ? { createdById: user.id } : {}) } },
    select: { quotationId: true },
  });
  if (!item) return;

  await prisma.quotationItem.delete({ where: { id: itemId } });

  const remaining = await prisma.quotationItem.findMany({
    where: { quotationId: item.quotationId },
  });
  const subtotal = remaining.reduce((sum, i) => sum + i.lineTotal, 0);

  await prisma.quotation.update({
    where: { id: item.quotationId },
    data: { subtotal, totalAmount: subtotal },
  });

  revalidatePath(`/sales/quotations/${item.quotationId}`);
}
