"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TargetEntityType, TargetMetric, TargetPeriod } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

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

  if (d.entityType === "USER") {
    if (!d.userId) throw new Error("User is required");
    const targetUser = await prisma.user.findFirst({ where: { id: d.userId, orgId }, select: { id: true } });
    if (!targetUser) throw new Error("User not found");
  } else if (d.entityType === "DEPARTMENT") {
    if (!d.departmentId) throw new Error("Department is required");
    const department = await prisma.department.findUnique({ where: { id: d.departmentId }, select: { id: true } });
    if (!department) throw new Error("Department not found");
  } else if (d.entityType === "BRANCH") {
    if (!d.branchId) throw new Error("Branch is required");
    const branch = await prisma.branch.findFirst({ where: { id: d.branchId, orgId }, select: { id: true } });
    if (!branch) throw new Error("Branch not found");
  }

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
    await prisma.salesTarget.updateMany({
      where: { id: existing.id, orgId },
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
  const { user, orgId } = await requireOrgSession();
  if (!can.setTargets(user)) {
    throw new Error("Unauthorized");
  }

  if (typeof actualValue !== "number" || !Number.isFinite(actualValue) || actualValue < 0) {
    throw new Error("Invalid actual value");
  }

  await prisma.salesTarget.updateMany({
    where: { id: targetId, orgId },
    data: { actualValue },
  });

  revalidatePath("/targets");
}

export async function deleteTarget(targetId: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.setTargets(user)) {
    throw new Error("Unauthorized");
  }

  await prisma.salesTarget.deleteMany({ where: { id: targetId, orgId } });

  revalidatePath("/targets");
}
