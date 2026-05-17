"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TargetEntityType, TargetMetric, TargetPeriod } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { getCurrentUserRole } from "@/lib/session";

const setTargetSchema = z.object({
  entityType: z.nativeEnum(TargetEntityType),
  userId: z.string().optional(),
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  metric: z.nativeEnum(TargetMetric),
  period: z.nativeEnum(TargetPeriod),
  periodLabel: z.string().min(1),
  targetValue: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export async function setTarget(data: {
  entityType: TargetEntityType;
  userId?: string;
  departmentId?: string;
  branchId?: string;
  metric: TargetMetric;
  period: TargetPeriod;
  periodLabel: string;
  targetValue: number;
  notes?: string;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.setTargets(user)) {
    throw new Error("Unauthorized");
  }

  const parsed = setTargetSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;

  const existing = await prisma.salesTarget.findFirst({
    where: {
      entityType: d.entityType,
      orgId,
      userId: d.userId ?? null,
      departmentId: d.departmentId ?? null,
      branchId: d.branchId ?? null,
      metric: d.metric,
      period: d.period,
      periodLabel: d.periodLabel,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.salesTarget.update({
      where: { id: existing.id },
      data: {
        targetValue: d.targetValue,
        notes: d.notes ?? null,
        setById: user.id,
      },
    });
  } else {
    await prisma.salesTarget.create({
      data: {
        entityType: d.entityType,
        orgId,
        userId: d.userId ?? null,
        departmentId: d.departmentId ?? null,
        branchId: d.branchId ?? null,
        metric: d.metric,
        period: d.period,
        periodLabel: d.periodLabel,
        targetValue: d.targetValue,
        notes: d.notes ?? null,
        setById: user.id,
      },
    });
  }

  revalidatePath("/targets");
}

export async function updateTargetActual(targetId: string, actualValue: number) {
  const { user } = await getCurrentUserRole();
  if (!can.setTargets(user)) {
    throw new Error("Unauthorized");
  }

  if (typeof actualValue !== "number" || !Number.isFinite(actualValue) || actualValue < 0) {
    throw new Error("Invalid actual value");
  }

  await prisma.salesTarget.update({
    where: { id: targetId },
    data: { actualValue },
  });

  revalidatePath("/targets");
}

export async function deleteTarget(targetId: string) {
  const { user } = await getCurrentUserRole();
  if (!can.setTargets(user)) {
    throw new Error("Unauthorized");
  }

  await prisma.salesTarget.delete({ where: { id: targetId } });

  revalidatePath("/targets");
}
