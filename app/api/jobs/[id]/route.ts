import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { session, user, orgId } = await requireOrgSession();

  const where =
    user.role === "TECHNICIAN_EXTERNAL"
      ? { id, orgId, assignedToId: session.user.id }
      : user.role === "TECHNICIAN_INTERNAL"
        ? { id, orgId, assignedToId: session.user.id }
        : { id, orgId };

  const job =
    user.role === "TECHNICIAN_EXTERNAL"
      ? await prisma.job.findFirst({
          where,
          select: {
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
            clientApproved: true,
            approvalDate: true,
            photos: { select: { id: true, url: true, label: true, uploadedAt: true } },
            updatedAt: true,
            receivedAt: true,
          },
        })
      : await prisma.job.findFirst({
          where,
          include: { client: true, photos: true },
        });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
