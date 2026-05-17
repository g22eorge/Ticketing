"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LeadStatus, QuotationStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { getCurrentUserRole } from "@/lib/session";

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
  const { user } = await getCurrentUserRole();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = createLeadSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const lead = await prisma.lead.create({
    data: {
      fullName: sanitizeText(parsed.data.fullName),
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

export async function updateLeadStatus(leadId: string, status: LeadStatus, note?: string) {
  const { user } = await getCurrentUserRole();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

  const existing = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!existing) throw new Error("Lead not found");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status,
      ...(status === "WON" ? { convertedAt: new Date() } : {}),
      ...(status === "LOST" || status === "STALE" ? { closedAt: new Date() } : {}),
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

export async function addLeadActivity(
  leadId: string,
  activity: { type: string; note: string },
) {
  const { user } = await getCurrentUserRole();
  if (!can.createLeads(user)) {
    throw new Error("Unauthorized");
  }

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
  const { user } = await getCurrentUserRole();
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

  const quotation = await prisma.quotation.create({
    data: {
      quoteNumber,
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
  const { user } = await getCurrentUserRole();

  if (status === "SENT") {
    if (!can.createQuotations(user)) throw new Error("Unauthorized");
  } else if (status === "ACCEPTED") {
    if (!can.approveQuotations(user)) throw new Error("Unauthorized");
  } else {
    if (!can.createQuotations(user)) throw new Error("Unauthorized");
  }

  const now = new Date();
  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      status,
      ...(status === "SENT" ? { sentAt: now } : {}),
      ...(status === "ACCEPTED" ? { acceptedAt: now, approvedById: user.id } : {}),
      ...(status === "REJECTED" ? { rejectedAt: now } : {}),
    },
  });

  revalidatePath(`/sales/quotations/${quotationId}`);
  revalidatePath("/sales");
}

export async function addQuotationItem(
  quotationId: string,
  item: { description: string; quantity: number; unitPrice: number; discount: number },
) {
  const { user } = await getCurrentUserRole();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);

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
  const { user } = await getCurrentUserRole();
  if (!can.createQuotations(user)) throw new Error("Unauthorized");

  const item = await prisma.quotationItem.findUnique({
    where: { id: itemId },
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
