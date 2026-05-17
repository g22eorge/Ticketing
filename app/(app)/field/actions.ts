"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FieldVisitStatus, FieldVisitType } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { getCurrentUserRole } from "@/lib/session";

const scheduleVisitSchema = z.object({
  jobId: z.string().optional(),
  branchId: z.string().optional(),
  assignedToId: z.string().min(1),
  type: z.nativeEnum(FieldVisitType),
  scheduledAt: z.coerce.date(),
  address: z.string().min(1),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

export async function scheduleVisit(data: {
  jobId?: string;
  branchId?: string;
  assignedToId: string;
  type: FieldVisitType;
  scheduledAt: Date | string;
  address: string;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}) {
  const { user } = await getCurrentUserRole();
  if (!can.manageFieldVisits(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = scheduleVisitSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  await prisma.fieldVisit.create({
    data: {
      orgId: null,
      jobId: parsed.data.jobId ?? null,
      branchId: parsed.data.branchId ?? null,
      assignedToId: parsed.data.assignedToId,
      scheduledById: user.id,
      type: parsed.data.type,
      status: "SCHEDULED",
      scheduledAt: parsed.data.scheduledAt,
      address: sanitizeText(parsed.data.address),
      contactName: sanitizeOptionalText(parsed.data.contactName),
      contactPhone: sanitizeOptionalText(parsed.data.contactPhone),
      notes: sanitizeOptionalText(parsed.data.notes),
    },
  });

  revalidatePath("/field");
  redirect("/field");
}

const managerStatuses: FieldVisitStatus[] = ["CANCELLED", "EN_ROUTE"];
const fieldTechStatuses: FieldVisitStatus[] = ["EN_ROUTE", "ARRIVED", "COMPLETED", "FAILED"];

export async function updateVisitStatus(
  visitId: string,
  status: FieldVisitStatus,
  extra?: { outcomeNotes?: string; signoffName?: string },
) {
  const { user } = await getCurrentUserRole();

  const isManager = can.manageFieldVisits(user);
  const isFieldTech = can.recordFieldSignoffs(user);

  if (!isManager && !isFieldTech) {
    throw new Error("Unauthorized");
  }

  if (managerStatuses.includes(status) && !isManager) {
    throw new Error("Unauthorized");
  }

  if (fieldTechStatuses.includes(status) && !isFieldTech && !isManager) {
    throw new Error("Unauthorized");
  }

  const visit = await prisma.fieldVisit.findUnique({ where: { id: visitId } });
  if (!visit) {
    throw new Error("Visit not found");
  }

  if (!isManager && visit.assignedToId !== user.id) {
    throw new Error("Unauthorized");
  }

  const now = new Date();
  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: {
      status,
      startedAt: status === "EN_ROUTE" ? now : undefined,
      completedAt: status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" ? now : undefined,
      outcomeNotes: extra?.outcomeNotes ? sanitizeText(extra.outcomeNotes) : undefined,
      signoffName: extra?.signoffName ? sanitizeText(extra.signoffName) : undefined,
      signoffAt: extra?.signoffName ? now : undefined,
    },
  });

  revalidatePath("/field");
  revalidatePath(`/field/${visitId}`);
}

export async function recordSignoff(
  visitId: string,
  data: { signoffName: string; outcomeNotes?: string },
) {
  const { user } = await getCurrentUserRole();
  if (!can.recordFieldSignoffs(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = z
    .object({
      signoffName: z.string().min(1),
      outcomeNotes: z.string().optional(),
    })
    .safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const visit = await prisma.fieldVisit.findUnique({ where: { id: visitId } });
  if (!visit) {
    throw new Error("Visit not found");
  }

  const isManager = can.manageFieldVisits(user);
  if (!isManager && visit.assignedToId !== user.id) {
    throw new Error("Unauthorized");
  }

  const now = new Date();
  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: {
      status: "COMPLETED",
      completedAt: now,
      signoffName: sanitizeText(parsed.data.signoffName),
      signoffAt: now,
      outcomeNotes: sanitizeOptionalText(parsed.data.outcomeNotes),
    },
  });

  revalidatePath("/field");
  revalidatePath(`/field/${visitId}`);
}
