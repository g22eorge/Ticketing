import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export async function GET() {
  const { session, user, orgId } = await requireOrgSession();

  const supportsOneTimeExternal = Boolean(
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "Job")
      ?.fields.some((field) => field.name === "oneTimeExternalAssignment"),
  );

  const where =
    user.role === "TECHNICIAN_EXTERNAL"
      ? { orgId, assignedToId: session.user.id }
      : user.role === "TECHNICIAN_INTERNAL"
        ? { orgId, assignedToId: session.user.id }
        : { orgId };

  const jobs = await (async () => {
    if (user.role === "TECHNICIAN_EXTERNAL") {
      const selectBase = {
        id: true,
        jobNumber: true,
        status: true,
        repairPath: true,
        deviceType: true,
        brand: true,
        model: true,
        serialOrImei: true,
        accessories: true,
        externalDiagnosis: true,
        partsNeeded: true,
        repairTimeline: true,
        timelineMinMinutes: true,
        timelineMaxMinutes: true,
        timelineConfidence: true,
        timelineNote: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
        updatedAt: true,
        receivedAt: true,
      } as const;

      const selectWith = supportsOneTimeExternal
        ? ({ ...selectBase, oneTimeExternalAssignment: { select: { technicianName: true } } } as const)
        : selectBase;

      return prisma.job
        .findMany({ where, select: selectWith, orderBy: { updatedAt: "desc" } })
        .catch(() => prisma.job.findMany({ where, select: selectBase, orderBy: { updatedAt: "desc" } }));
    }

    const selectBase = {
      id: true,
      jobNumber: true,
      status: true,
      repairPath: true,
      deviceType: true,
      brand: true,
      model: true,
      serialOrImei: true,
      accessories: true,
      issueDescription: true,
      diagnosisNotes: true,
      externalDiagnosis: true,
      recommendedRepair: true,
      partsNeeded: true,
      externalTechBill: true,
      clientBill: true,
      clientApproved: true,
      approvalDate: true,
      quotedAt: true,
      repairTimeline: true,
      timelineMinMinutes: true,
      timelineMaxMinutes: true,
      timelineConfidence: true,
      timelineNote: true,
      technicianNotes: true,
      workDone: true,
      partsReplaced: true,
      receivedAt: true,
      completedAt: true,
      closedAt: true,
      updatedAt: true,
      deviceId: true,
      deliveredAt: true,
      deliveryMethod: true,
      deliveredTo: true,
      client: { select: { id: true, fullName: true, phone: true, email: true, organization: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    } as const;

    const selectWith = supportsOneTimeExternal
      ? ({ ...selectBase, oneTimeExternalAssignment: { select: { technicianName: true } } } as const)
      : selectBase;

    return prisma.job
      .findMany({ where, select: selectWith, orderBy: { updatedAt: "desc" } })
      .catch(() => prisma.job.findMany({ where, select: selectBase, orderBy: { updatedAt: "desc" } }));
  })();

  return NextResponse.json(jobs);
}
