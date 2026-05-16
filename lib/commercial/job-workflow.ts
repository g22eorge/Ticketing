import { prisma } from "@/lib/prisma";

export async function writeJobStatusHistory({
  orgId,
  jobId,
  fromStatus,
  toStatus,
  changedById,
  reason,
  metadata,
}: {
  orgId: string;
  jobId: string;
  fromStatus?: string | null;
  toStatus: string;
  changedById?: string | null;
  reason?: string | null;
  metadata?: unknown;
}) {
  try {
    await prisma.jobStatusHistory.create({
      data: {
        orgId,
        jobId,
        fromStatus: fromStatus ?? null,
        toStatus,
        changedById: changedById ?? null,
        reason: reason ?? null,
        metadataJson: metadata === undefined ? null : JSON.stringify(metadata),
      },
    });
  } catch {
    // Workflow history is additive during commercial rollout; never block job updates.
  }
}

export async function writeJobAssignmentHistory({
  orgId,
  jobId,
  previousAssignedToId,
  assignedToId,
  assignedById,
  note,
}: {
  orgId: string;
  jobId: string;
  previousAssignedToId?: string | null;
  assignedToId?: string | null;
  assignedById?: string | null;
  note?: string | null;
}) {
  try {
    if (previousAssignedToId) {
      await prisma.jobAssignmentHistory.updateMany({
        where: {
          orgId,
          jobId,
          assignedToId: previousAssignedToId,
          endedAt: null,
        },
        data: { endedAt: new Date() },
      });
    }

    if (!assignedToId) return;

    await prisma.jobAssignmentHistory.create({
      data: {
        orgId,
        jobId,
        assignedToId,
        assignedById: assignedById ?? null,
        assignmentType: "PRIMARY",
        note: note ?? null,
      },
    });
  } catch {
    // Assignment history is additive during commercial rollout; never block assignment changes.
  }
}
