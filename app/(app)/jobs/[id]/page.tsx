import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { ExternalTechJobView } from "@/components/jobs/ExternalTechJobView";
import { JobDetailTabs } from "@/components/jobs/JobDetailTabs";
import { getClientBill, getExternalTechBill } from "@/lib/billing";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { returnTo, tab } = await searchParams;
  const { session, user } = await getCurrentUserRole();
  const safeReturnTo =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/jobs";

  const canOverseeExternal = user.permissions.includes("can_view_external_updates") || user.permissions.includes("can_view_external_quotes");
  const canAccessAllForPricing = can.approveInvoices(user);
  const where =
    user.role === "TECHNICIAN_EXTERNAL" || (user.role === "TECHNICIAN_INTERNAL" && !canOverseeExternal && !canAccessAllForPricing)
      ? { id, assignedToId: session.user.id }
      : { id };

  if (user.role === "TECHNICIAN_EXTERNAL") {
    const job = await prisma.job.findFirst({
      where,
      include: { photos: true },
    });

    if (!job) {
      notFound();
    }

    const jobWithTimeline = job as typeof job & {
      timelineMinMinutes?: number | null;
      timelineMaxMinutes?: number | null;
      timelineConfidence?: "FIRM" | "ESTIMATED" | "PARTS_DEPENDENT" | null;
      timelineNote?: string | null;
    };

    return (
      <ExternalTechJobView
        job={{
          id: job.id,
          jobNumber: job.jobNumber,
          status: job.status,
          updatedAt: job.updatedAt.toISOString(),
          clientApproved: job.clientApproved,
          approvalDate: job.approvalDate ? job.approvalDate.toISOString() : null,
          deviceType: job.deviceType,
          brand: job.brand,
          model: job.model,
          serialOrImei: job.serialOrImei,
          accessories: job.accessories,
          externalDiagnosis: job.externalDiagnosis,
          partsNeeded: job.partsNeeded,
          externalTechBill: getExternalTechBill(job),
          repairTimeline: job.repairTimeline,
          timelineMinMinutes: jobWithTimeline.timelineMinMinutes ?? null,
          timelineMaxMinutes: jobWithTimeline.timelineMaxMinutes ?? null,
          timelineConfidence: jobWithTimeline.timelineConfidence ?? null,
          timelineNote: jobWithTimeline.timelineNote ?? null,
        }}
        returnTo={safeReturnTo}
      />
    );
  }

  const supportsOneTimeExternal = Boolean(
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "Job")
      ?.fields.some((field) => field.name === "oneTimeExternalAssignment"),
  );

  const canSeeMessages = ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role);

  const includeBase = {
    client: true,
    assignedTo: true,
    photos: true,
    auditLogs: {
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" as const },
    },
  } as const;

  const includeWithOneTime = supportsOneTimeExternal
    ? ({ ...includeBase, oneTimeExternalAssignment: true } as const)
    : includeBase;

  const job = await prisma.job
    .findFirst({ where, include: includeWithOneTime })
    .catch(() => prisma.job.findFirst({ where, include: includeBase }));

  if (!job) {
    notFound();
  }

  const technicians =
    can.assignJobs(user)
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            role: { in: [Role.TECHNICIAN_INTERNAL, Role.TECHNICIAN_EXTERNAL] },
          },
          select: { id: true, name: true, role: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        })
      : [];

  const jobWithBilling = {
    ...job,
    externalTechBill: getExternalTechBill(job),
    clientBill: getClientBill(job),
  };

  if (!("oneTimeExternalAssignment" in jobWithBilling)) {
    (jobWithBilling as typeof jobWithBilling & { oneTimeExternalAssignment?: null }).oneTimeExternalAssignment = null;
  }

  // Device history: show other jobs for the same device when available.
  // We avoid exposing any client info here; this is only rendered for non-external roles.
  let deviceHistory: Array<{
    id: string;
    jobNumber: string;
    status: typeof job.status;
    receivedAt: Date;
    completedAt: Date | null;
    updatedAt: Date;
  }> = [];

  try {
    const deviceId = (job as typeof job & { deviceId?: string | null }).deviceId ?? null;
    const serialOrImei = (job as typeof job & { serialOrImei?: string | null }).serialOrImei ?? null;

    if (deviceId) {
      deviceHistory = await prisma.job.findMany({
        where: { deviceId, id: { not: job.id } },
        orderBy: { receivedAt: "desc" },
        take: 10,
        select: { id: true, jobNumber: true, status: true, receivedAt: true, completedAt: true, updatedAt: true },
      });
    } else if (serialOrImei) {
      deviceHistory = await prisma.job.findMany({
        where: { clientId: job.clientId, serialOrImei, id: { not: job.id } },
        orderBy: { receivedAt: "desc" },
        take: 10,
        select: { id: true, jobNumber: true, status: true, receivedAt: true, completedAt: true, updatedAt: true },
      });
    }
  } catch {
    deviceHistory = [];
  }

  type OutboundRow = {
    id: string; to: string; body: string; type: string;
    sentAt: Date | null; createdAt: Date; providerDeliveryStatus: string | null;
  };
  type InboundRow = {
    id: string; from: string; body: string | null; mediaType: string | null;
    mediaCaption: string | null; timestamp: Date; isRead: boolean;
  };

  let outboundMessages: OutboundRow[] = [];
  let inboundMessages: InboundRow[] = [];

  if (canSeeMessages) {
    const msgSelect = {
      id: true, to: true, body: true, type: true,
      sentAt: true, createdAt: true, providerDeliveryStatus: true,
    } as const;

    // Messages linked directly to the job
    const [jobOutbound, linkedRequest] = await Promise.all([
      prisma.outboundMessage.findMany({
        where: { jobId: job.id },
        orderBy: { createdAt: "asc" },
        select: msgSelect,
      }),
      prisma.repairRequest.findFirst({
        where: { linkedJobId: job.id },
        select: { id: true },
      }).catch(() => null),
    ]);

    // Messages sent during the repair request phase (before job creation)
    const requestOutbound = linkedRequest
      ? await prisma.outboundMessage.findMany({
          where: { repairRequestId: linkedRequest.id },
          orderBy: { createdAt: "asc" },
          select: msgSelect,
        })
      : [];

    // Deduplicate by id and sort chronologically
    const seen = new Set<string>();
    outboundMessages = [...jobOutbound, ...requestOutbound]
      .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    inboundMessages = await prisma.inboundMessage.findMany({
      where: { jobId: job.id },
      orderBy: { timestamp: "asc" },
      select: {
        id: true, from: true, body: true, mediaType: true,
        mediaCaption: true, timestamp: true, isRead: true,
      },
    }).catch(() => []);
  }

  return (
    <JobDetailTabs
      role={user.role}
      permissions={user.permissions}
      job={{ ...jobWithBilling, outboundMessages, inboundMessages }}
      technicians={technicians}
      deviceHistory={deviceHistory}
      returnTo={safeReturnTo}
      initialTab={tab}
    />
  );
}
