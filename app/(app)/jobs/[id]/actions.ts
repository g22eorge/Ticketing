"use server";

import {
  CommunicationStatus,
  JobStatus,
  Prisma,
  RecommendationOption,
  RepairPath,
  Role,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { hasJobPayoutColumns } from "@/lib/payouts";
import { sanitizeOptionalText } from "@/lib/sanitize";
import { getCurrentUserRole } from "@/lib/session";
import {
  notifyStatusChange,
  notifyJobAssigned,
  notifyTimelineUpdate,
  notifyDelayNote,
} from "@/lib/notifications";
import { deliverOutboundMessage, enqueueWhatsAppMessage } from "@/lib/notifications/whatsapp-outbox";
import { uploadWhatsAppMedia, sendWhatsAppDocument } from "@/lib/notifications/whatsapp";
import { generateQuotationBuffer } from "@/lib/pdf/generate-quotation";
import { generateInvoiceBuffer } from "@/lib/pdf/generate-invoice";
import { generateJobCardBuffer } from "@/lib/pdf/generate-job-card";

const workflowReasonValues = [
  "NONE",
  "PARTS_PENDING",
  "SPECIALIST_ESCALATION",
  "CLIENT_DECLINED",
  "UNREPAIRABLE",
  "CUSTOMER_CANCELLED",
  "OTHER",
] as const;

const updateSchema = z.object({
  jobId: z.string().min(1),
  expectedUpdatedAt: z.string().optional(),
  assignedToId: z.string().optional(),
  diagnosisNotes: z.string().optional(),
  externalDiagnosis: z.string().optional(),
  partsNeeded: z.string().optional(),
  externalTechBill: z.coerce.number().optional(),
  clientBill: z.coerce.number().optional(),
  externalTechFee: z.coerce.number().optional(),
  vatApplicable: z.enum(["true", "false"]).optional(),
  externalPaid: z.enum(["true", "false"]).optional(),
  externalPaymentRef: z.string().optional(),
  recommendationOption: z.nativeEnum(RecommendationOption).optional(),
  communicationStatus: z.nativeEnum(CommunicationStatus).optional(),
  clientConversationNote: z.string().optional(),
  repairPath: z.nativeEnum(RepairPath).optional(),
  repairTimeline: z.string().optional(),
  timelineMinValue: z.coerce.number().positive().optional(),
  timelineMaxValue: z.coerce.number().positive().optional(),
  timelineUnit: z.enum(["HOUR", "DAY", "WEEK"]).optional(),
  timelineConfidence: z.enum(["FIRM", "ESTIMATED", "PARTS_DEPENDENT"]).optional(),
  timelineNote: z.string().optional(),
  workflowReason: z.enum(workflowReasonValues).optional(),
  statusNote: z.string().optional(),
  workDone: z.string().optional(),
  partsReplaced: z.string().optional(),
  nextStatus: z.nativeEnum(JobStatus).optional(),
  deliveryMethod: z.enum(["PICKUP", "DELIVERY", "COURIER"]).optional(),
  deliveredTo: z.string().optional(),
});

const oneTimeExternalSchema = z.object({
  jobId: z.string().min(1),
  expectedUpdatedAt: z.string().optional(),
  technicianName: z.string().min(1),
  phone: z.string().min(3),
  specialization: z.string().optional(),
  agreedRepairCost: z.coerce.number().optional(),
  expectedPartsCost: z.coerce.number().optional(),
  partsNotes: z.string().optional(),
  assignedDate: z.string().min(1),
  expectedReturnDate: z.string().optional(),
  returnedDate: z.string().optional(),
  instructions: z.string().optional(),
  progressNotes: z.string().optional(),
  finalOutcome: z.string().optional(),
  outsourcingStatus: z.nativeEnum(JobStatus).optional(),
});

function toMiddayUtcDate(value: string | undefined) {
  if (!value) return null;
  // Expect YYYY-MM-DD (from <input type="date">). Use midday UTC to avoid timezone rollbacks.
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildTimeline(payload: z.infer<typeof updateSchema>) {
  const unitMinutes =
    payload.timelineUnit === "HOUR"
      ? 60
      : payload.timelineUnit === "DAY"
        ? 60 * 24
        : payload.timelineUnit === "WEEK"
          ? 60 * 24 * 7
          : null;

  if (!unitMinutes || (!payload.timelineMinValue && !payload.timelineMaxValue)) {
    return null;
  }

  const minValue = payload.timelineMinValue ?? payload.timelineMaxValue ?? 0;
  const maxValue = payload.timelineMaxValue ?? payload.timelineMinValue ?? 0;
  const minMinutes = Math.round(minValue * unitMinutes);
  const maxMinutes = Math.round(maxValue * unitMinutes);
  const unitLabel = payload.timelineUnit ?? "HOUR";
  const labelUnit = unitLabel.toLowerCase() + (maxValue > 1 || minValue > 1 ? "s" : "");
  const label = minValue === maxValue ? `${minValue} ${labelUnit}` : `${minValue}-${maxValue} ${labelUnit}`;

  return {
    timelineMinMinutes: Math.min(minMinutes, maxMinutes),
    timelineMaxMinutes: Math.max(minMinutes, maxMinutes),
    repairTimeline: label,
  };
}

export async function updateJobAction(formData: FormData) {
  const { session, user } = await getCurrentUserRole();
  const permissionUser = { role: user.role, permissions: user.permissions };
  // FRONT_DESK users are read-only by default (they create jobs, not edit them).
  // Exception: users who have been granted specific elevated permissions
  // (billing entry or technician assignment) pass through to those gates.
  const isReadOnlyIntake =
    user.role === "FRONT_DESK" &&
    !can.editDiagnosis(permissionUser) &&
    !can.approveInvoices(permissionUser) &&
    !can.assignJobs(permissionUser);
  if (isReadOnlyIntake) {
    return { error: "Intake is read-only after job creation." };
  }
  const hasPartsNeededField = formData.has("partsNeeded");
  const hasStatusNoteField = formData.has("statusNote");
  const hasWorkflowReasonField = formData.has("workflowReason");
  const hasCommunicationStatusField = formData.has("communicationStatus");
  const hasClientConversationNoteField = formData.has("clientConversationNote");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const payload = parsed.data;
  // Select explicitly to avoid runtime failures if some newer columns (e.g. deviceId)
  // are not yet present in a given environment.
  const selectExistingBase = {
    id: true,
    updatedAt: true,
    status: true,
    assignedToId: true,
    repairPath: true,
    // billing + payouts
    clientBill: true,
    vatApplicable: true,
    externalTechFee: true,
    externalPaid: true,
    externalPaymentRef: true,
    // workflow + comms
    communicationStatus: true,
    clientConversationNote: true,
    workflowReason: true,
    statusNote: true,
    // diagnosis + repair
    diagnosisNotes: true,
    externalDiagnosis: true,
    partsNeeded: true,
    workDone: true,
    partsReplaced: true,
    // timeline
    repairTimeline: true,
    timelineNote: true,
    // approval fields (used by status transitions)
    clientApproved: true,
    approvalDate: true,
  } as const;

  const existing = await prisma.job
    .findUnique({
      where: { id: payload.jobId },
      select: {
        ...selectExistingBase,
        serviceType: true,
      },
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("serviceType")) {
        return prisma.job.findUnique({
          where: { id: payload.jobId },
          select: selectExistingBase,
        }) as unknown as Promise<(typeof selectExistingBase & { id: string }) | null>;
      }
      throw error;
    });
  if (!existing) {
    return { error: "Job not found" };
  }

  const existingServiceType =
    "serviceType" in existing && typeof (existing as { serviceType?: string }).serviceType === "string"
      ? ((existing as { serviceType?: string }).serviceType as string)
      : "HARDWARE";

  if (payload.expectedUpdatedAt) {
    const expected = new Date(payload.expectedUpdatedAt).toISOString();
    const actual = existing.updatedAt.toISOString();
    if (expected !== actual) {
      return {
        error:
          "This job changed since you opened it. Refresh and review latest updates before saving.",
      };
    }
  }

  const transitions: Partial<Record<JobStatus, JobStatus[]>> = {
    RECEIVED: [JobStatus.DIAGNOSING],
    DIAGNOSING: [
      JobStatus.REFERRED,
      JobStatus.IN_REPAIR,
      JobStatus.AWAITING_APPROVAL,
      JobStatus.CLOSED,
    ],
    REFERRED: [JobStatus.IN_REPAIR, JobStatus.AWAITING_APPROVAL, JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    PENDING_EXTERNAL_ASSIGNMENT: [JobStatus.IN_REPAIR, JobStatus.AWAITING_APPROVAL, JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    ASSIGNED_ONE_TIME_EXTERNAL: [JobStatus.IN_REPAIR, JobStatus.AWAITING_APPROVAL, JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    WAITING_FOR_PARTS: [JobStatus.IN_REPAIR, JobStatus.AWAITING_APPROVAL, JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    RETURNED_FROM_EXTERNAL: [JobStatus.IN_REPAIR, JobStatus.AWAITING_APPROVAL, JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    AWAITING_APPROVAL: [JobStatus.IN_REPAIR, JobStatus.CLOSED],
    IN_REPAIR: [JobStatus.READY_FOR_PICKUP, JobStatus.COMPLETED, JobStatus.CLOSED],
    READY_FOR_PICKUP: [JobStatus.COMPLETED, JobStatus.CLOSED],
  };

  if (payload.nextStatus) {
    const allowedForStatus = transitions[existing.status] ?? [];
    if (!allowedForStatus.includes(payload.nextStatus)) {
      return { error: "Invalid status transition" };
    }
  }

  const roleCanTransition = (role: Role, nextStatus: JobStatus) => {
    if (role === "ADMIN") return true;
    if (can.editDiagnosis(permissionUser)) {
      return (
        [
          JobStatus.DIAGNOSING,
          JobStatus.REFERRED,
          JobStatus.IN_REPAIR,
          JobStatus.READY_FOR_PICKUP,
          JobStatus.COMPLETED,
          JobStatus.CLOSED,
        ] as JobStatus[]
      ).includes(nextStatus);
    }
    if (role === "TECHNICIAN_INTERNAL") {
      return (
        [
          JobStatus.DIAGNOSING,
          JobStatus.REFERRED,
          JobStatus.IN_REPAIR,
          JobStatus.READY_FOR_PICKUP,
          JobStatus.COMPLETED,
          JobStatus.CLOSED,
        ] as JobStatus[]
      ).includes(nextStatus);
    }
    if (role === "TECHNICIAN_EXTERNAL") {
      return ([JobStatus.COMPLETED] as JobStatus[]).includes(nextStatus);
    }
    if (role === "OPS") {
      return (
        [
          JobStatus.REFERRED,
          JobStatus.AWAITING_APPROVAL,
          JobStatus.CLOSED,
          JobStatus.IN_REPAIR,
          JobStatus.READY_FOR_PICKUP,
          JobStatus.COMPLETED,
        ] as JobStatus[]
      ).includes(nextStatus);
    }
    return false;
  };

  if (payload.nextStatus && !roleCanTransition(user.role, payload.nextStatus)) {
    return { error: "You do not have permission for this status change" };
  }

  if (payload.nextStatus === JobStatus.COMPLETED) {
    const incomingClientBill = typeof payload.clientBill === "number" ? payload.clientBill : undefined;
    const existingClientBill =
      typeof (existing as { clientBill?: number | null }).clientBill === "number"
        ? (existing as { clientBill?: number }).clientBill
        : typeof (existing as { finalCost?: number | null }).finalCost === "number"
          ? (existing as { finalCost?: number }).finalCost
          : undefined;
    const hasFinalCostAfterUpdate =
      typeof existingClientBill === "number" || typeof incomingClientBill === "number";

    if (!hasFinalCostAfterUpdate) {
      return {
        error:
          "Cannot complete job yet. Our bill to client must be set by Admin first.",
      };
    }
  }

  const canBypassAssignmentForPricing = can.approveInvoices(permissionUser);
  if (
    (user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL") &&
    existing.assignedToId !== session.user.id &&
    !canBypassAssignmentForPricing
  ) {
    return { error: "Forbidden" };
  }

  const payoutChangeRequested =
    payload.externalTechFee !== undefined ||
    payload.externalPaid !== undefined ||
    payload.externalPaymentRef !== undefined;
  const canManagePayouts = user.role === "ADMIN" || can.reviewExternalBills(permissionUser);

  const adminFinancialChangeRequested =
    payload.clientBill !== undefined || payload.vatApplicable !== undefined;

  if (adminFinancialChangeRequested && !can.approveInvoices(permissionUser)) {
    return { error: "Only authorized invoice approvers can update client billing controls." };
  }

  if (payoutChangeRequested && !canManagePayouts) {
    return { error: "Only authorized finance users can update payout controls." };
  }

  if (payoutChangeRequested && canManagePayouts) {
    const payoutColumnsReady = await hasJobPayoutColumns();
    if (!payoutColumnsReady) {
      return {
        error:
          "Payout fields are not available in this environment yet. Run latest Prisma migration and restart the app.",
      };
    }
  }

  const data: Record<string, unknown> = {};
  const timeline = buildTimeline(payload);

  if (user.role === "TECHNICIAN_EXTERNAL") {
    data.externalDiagnosis = sanitizeOptionalText(payload.externalDiagnosis) || undefined;
    if (hasPartsNeededField) {
      data.partsNeeded = sanitizeOptionalText(payload.partsNeeded) || null;
    }
    if (hasStatusNoteField) {
      data.statusNote = sanitizeOptionalText(payload.statusNote) || null;
    }
    if (hasWorkflowReasonField) {
      data.workflowReason = payload.workflowReason ?? "NONE";
    }
    data.repairTimeline = timeline?.repairTimeline ?? (sanitizeOptionalText(payload.repairTimeline) || undefined);
    data.timelineMinMinutes = timeline?.timelineMinMinutes;
    data.timelineMaxMinutes = timeline?.timelineMaxMinutes;
    data.timelineConfidence = payload.timelineConfidence;
    data.timelineNote = sanitizeOptionalText(payload.timelineNote) || undefined;
    data.externalTechBill = payload.externalTechBill;
    if (payload.nextStatus === JobStatus.COMPLETED) {
      data.status = JobStatus.COMPLETED;
      data.completedAt = new Date();
    }
  } else {
    data.diagnosisNotes = sanitizeOptionalText(payload.diagnosisNotes) || undefined;
    data.externalDiagnosis = sanitizeOptionalText(payload.externalDiagnosis) || undefined;
    if (hasPartsNeededField) {
      data.partsNeeded = sanitizeOptionalText(payload.partsNeeded) || null;
    }
    if (hasStatusNoteField) {
      data.statusNote = sanitizeOptionalText(payload.statusNote) || null;
    }
    if (hasWorkflowReasonField) {
      data.workflowReason = payload.workflowReason ?? "NONE";
    }
    data.repairTimeline = timeline?.repairTimeline ?? (sanitizeOptionalText(payload.repairTimeline) || undefined);
    data.timelineMinMinutes = timeline?.timelineMinMinutes;
    data.timelineMaxMinutes = timeline?.timelineMaxMinutes;
    data.timelineConfidence = payload.timelineConfidence;
    data.timelineNote = sanitizeOptionalText(payload.timelineNote) || undefined;
    data.workDone = sanitizeOptionalText(payload.workDone) || undefined;
    data.partsReplaced = sanitizeOptionalText(payload.partsReplaced) || undefined;
    data.externalTechBill = payload.externalTechBill;
    if (can.assignJobs(permissionUser) && payload.assignedToId !== undefined) {
      const assigneeId = payload.assignedToId.trim();
      if (!assigneeId) {
        data.assignedToId = null;
      } else {
        const assignee = await prisma.user.findFirst({
          where: {
            id: assigneeId,
            isActive: true,
            role: { in: [Role.TECHNICIAN_INTERNAL, Role.TECHNICIAN_EXTERNAL] },
          },
          select: { id: true, role: true },
        });

        if (!assignee) {
          return { error: "Invalid assignee. Select an active technician." };
        }

        // Software services are internal-only.
        if (existingServiceType !== "HARDWARE" && assignee.role === Role.TECHNICIAN_EXTERNAL) {
          return { error: "Software jobs cannot be assigned to external technicians." };
        }

        data.assignedToId = assignee.id;
        data.repairPath =
          assignee.role === Role.TECHNICIAN_EXTERNAL
            ? RepairPath.EXTERNAL
            : RepairPath.IN_HOUSE;
      }
    }
    if (can.approveInvoices(permissionUser)) {
      data.clientBill = payload.clientBill;
    }
    if (canManagePayouts) {
      data.externalTechFee = payload.externalTechFee;
      if (user.role === "ADMIN" && payload.vatApplicable !== undefined) {
        data.vatApplicable = payload.vatApplicable === "true";
      }

      if (payload.externalPaymentRef !== undefined) {
        data.externalPaymentRef = sanitizeOptionalText(payload.externalPaymentRef) || null;
      }

      if (payload.externalPaid !== undefined) {
        const isPaid = payload.externalPaid === "true";
        data.externalPaid = isPaid;
        data.externalPaidAt = isPaid ? new Date() : null;
        data.externalPaidById = isPaid ? session.user.id : null;
        if (!isPaid) {
          data.externalPaymentRef = null;
        }
      }
    }
    if (user.role === "ADMIN" || user.role === "OPS" || can.assignJobs(permissionUser)) {
      if (payload.recommendationOption !== undefined) {
        data.recommendationOption = payload.recommendationOption;
      }
      if (hasCommunicationStatusField) {
        data.communicationStatus = payload.communicationStatus ?? existing.communicationStatus;
      }

      const nextClientConversationNote =
        hasClientConversationNoteField
          ? sanitizeOptionalText(payload.clientConversationNote) || null
          : existing.clientConversationNote;

      if (hasClientConversationNoteField) {
        data.clientConversationNote = nextClientConversationNote;
      }

      const communicationChanged =
        hasCommunicationStatusField &&
        (payload.communicationStatus ?? existing.communicationStatus) !== existing.communicationStatus;
      const conversationChanged =
        hasClientConversationNoteField && nextClientConversationNote !== existing.clientConversationNote;

      if (communicationChanged || conversationChanged) {
        data.lastClientContactAt = new Date();
      }
    }
    data.status = payload.nextStatus;
    if (existing.status === JobStatus.AWAITING_APPROVAL && payload.nextStatus) {
      data.clientApproved = payload.nextStatus === JobStatus.IN_REPAIR;
      data.approvalDate = new Date();
    }
    data.completedAt = payload.nextStatus === JobStatus.COMPLETED ? new Date() : undefined;
    // Delivery fields should only be captured at the end of the workflow.
    // DELIVERED status is deprecated in UI; keep deliveredAt only when staff set it explicitly.
    data.deliveredAt = undefined;
    const isTerminalTransition = payload.nextStatus === JobStatus.COMPLETED || payload.nextStatus === JobStatus.CLOSED;
    if (isTerminalTransition && payload.deliveryMethod) {
      data.deliveryMethod = payload.deliveryMethod;
    }
    if (isTerminalTransition && payload.deliveredTo) {
      data.deliveredTo = sanitizeOptionalText(payload.deliveredTo) || null;
    }
    data.closedAt =
      payload.nextStatus === JobStatus.CLOSED
        ? new Date()
        : undefined;
  }

  let updated;
  try {
    updated = await prisma.job.update({
      where: { id: payload.jobId },
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const legacyClientBillField = message.includes("Unknown argument `clientBill`");
    const legacyExternalBillField = message.includes("Unknown argument `externalTechBill`");
    if (
      message.includes("Unknown argument `timelineMinMinutes`") ||
      message.includes("Unknown argument `timelineMaxMinutes`") ||
      message.includes("Unknown argument `timelineConfidence`") ||
      message.includes("Unknown argument `timelineNote`") ||
      legacyClientBillField ||
      legacyExternalBillField ||
      message.includes("Unknown argument `recommendationOption`") ||
      message.includes("Unknown argument `communicationStatus`") ||
      message.includes("Unknown argument `clientConversationNote`") ||
      message.includes("Unknown argument `lastClientContactAt`")
      || message.includes("Unknown argument `vatApplicable`")
      || message.includes("Unknown argument `statusNote`")
      || message.includes("Unknown argument `workflowReason`")
    ) {
      const fallbackData = { ...data } as Record<string, unknown>;
      delete fallbackData.timelineMinMinutes;
      delete fallbackData.timelineMaxMinutes;
      delete fallbackData.timelineConfidence;
      delete fallbackData.timelineNote;

      if (legacyClientBillField && "clientBill" in fallbackData) {
        fallbackData.finalCost = fallbackData.clientBill;
        delete fallbackData.clientBill;
      }
      if (legacyExternalBillField && "externalTechBill" in fallbackData) {
        fallbackData.costEstimate = fallbackData.externalTechBill;
        delete fallbackData.externalTechBill;
      }
      delete fallbackData.recommendationOption;
      delete fallbackData.communicationStatus;
      delete fallbackData.clientConversationNote;
      delete fallbackData.lastClientContactAt;
      delete fallbackData.vatApplicable;
      delete fallbackData.statusNote;
      delete fallbackData.workflowReason;
      delete fallbackData.deliveredAt;
      delete fallbackData.deliveryMethod;
      delete fallbackData.deliveredTo;

      updated = await (prisma.job as unknown as {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
          id: string;
        }>;
      }).update({
        where: { id: payload.jobId },
        data: fallbackData,
      });
    } else {
      throw error;
    }
  }

  await prisma.auditLog.create({
    data: {
      jobId: updated.id,
      userId: session.user.id,
      action: payload.nextStatus ? "STATUS_CHANGED" : "JOB_UPDATED",
      detail: JSON.stringify(payload),
    },
  });

  const job = await prisma.job.findUnique({
    where: { id: payload.jobId },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      assignedToId: true,
      brand: true,
      model: true,
      repairTimeline: true,
      timelineNote: true,
      client: { select: { fullName: true, phone: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  });

  if (!job) {
    return { success: true };
  }

  // Notifications must compare against the pre-update snapshot.
  // `job` is fetched after the update, so compare to `existing`.
  if (existing.status !== job.status) {
    await notifyStatusChange(job.id, existing.status, job.status, job.jobNumber, job.client.fullName);
  }

  if (existing.assignedToId !== job.assignedToId && job.assignedToId) {
    await notifyJobAssigned(job.id, job.jobNumber, `${job.brand} ${job.model}`, job.assignedToId);
  }

  if (existing.repairTimeline !== job.repairTimeline && job.repairTimeline) {
    await notifyTimelineUpdate(job.id, job.jobNumber, `${job.brand} ${job.model}`, job.repairTimeline);
  }

  if (existing.timelineNote !== (job as typeof job & { timelineNote?: string | null }).timelineNote) {
    const nextNote = (job as typeof job & { timelineNote?: string | null }).timelineNote;
    if (nextNote) {
      await notifyDelayNote(job.id, job.jobNumber, `${job.brand} ${job.model}`, nextNote);
    }
  }

  revalidatePath(`/jobs/${payload.jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/technicians");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function updateOneTimeExternalAssignmentAction(formData: FormData) {
  const { session, user } = await getCurrentUserRole();
  const permissionUser = { role: user.role, permissions: user.permissions };
  const isRest = user.email?.toLowerCase() === "rest@eagle.tech";

  if (!(user.role === "ADMIN" || user.role === "OPS" || isRest || can.assignJobs(permissionUser))) {
    return { error: "Forbidden" };
  }

  const supportsOneTimeExternal = Boolean(
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "Job")
      ?.fields.some((field) => field.name === "oneTimeExternalAssignment"),
  );

  if (!supportsOneTimeExternal) {
    return { error: "One-time external assignments are not available (Prisma client is out of date). Restart and run prisma generate." };
  }

  const parsed = oneTimeExternalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const payload = parsed.data;
  const allowedOutsourceStatuses = new Set<JobStatus>([JobStatus.REFERRED, JobStatus.COMPLETED]);

  const existing = await prisma.job
    .findUnique({
      where: { id: payload.jobId },
      select: { id: true, updatedAt: true, status: true, serviceType: true },
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("serviceType")) {
        return prisma.job.findUnique({
          where: { id: payload.jobId },
          select: { id: true, updatedAt: true, status: true },
        }) as unknown as Promise<({ id: string; updatedAt: Date; status: JobStatus } & { serviceType?: string }) | null>;
      }
      throw error;
    });

  if (!existing) {
    return { error: "Job not found" };
  }

  const existingServiceType =
    "serviceType" in existing && typeof (existing as { serviceType?: string }).serviceType === "string"
      ? ((existing as { serviceType?: string }).serviceType as string)
      : "HARDWARE";

  if (existingServiceType !== "HARDWARE") {
    return { error: "Software jobs cannot be outsourced to one-time external technicians." };
  }

  if (payload.expectedUpdatedAt) {
    const expected = new Date(payload.expectedUpdatedAt).toISOString();
    const actual = existing.updatedAt.toISOString();
    if (expected !== actual) {
      return { error: "This job changed since you opened it. Refresh and try again." };
    }
  }

  const nextStatus = payload.outsourcingStatus;
  if (nextStatus && !allowedOutsourceStatuses.has(nextStatus)) {
    return { error: "Invalid outsourcing status" };
  }

  const assignedAt = toMiddayUtcDate(payload.assignedDate);
  if (!assignedAt) {
    return { error: "Invalid assigned date" };
  }

  const expectedReturnAt = toMiddayUtcDate(payload.expectedReturnDate);
  const returnedAt = toMiddayUtcDate(payload.returnedDate);

  const baseAssignmentData = {
    technicianName: payload.technicianName.trim(),
    phone: payload.phone.trim(),
    specialization: sanitizeOptionalText(payload.specialization) || null,
    agreedRepairCost: typeof payload.agreedRepairCost === "number" ? payload.agreedRepairCost : null,
    expectedPartsCost: typeof payload.expectedPartsCost === "number" ? payload.expectedPartsCost : null,
    partsNotes: sanitizeOptionalText(payload.partsNotes) || null,
    assignedAt,
    expectedReturnAt,
    instructions: sanitizeOptionalText(payload.instructions) || null,
    progressNotes: sanitizeOptionalText(payload.progressNotes) || null,
    finalOutcome: sanitizeOptionalText(payload.finalOutcome) || null,
  };

  const createAssignmentData = {
    ...baseAssignmentData,
    returnedAt: returnedAt ?? null,
  };

  const updateAssignmentData: Record<string, unknown> = {
    ...baseAssignmentData,
  };

  // Only touch returnedAt when explicitly set, or when we are auto-marking the handover.
  if (returnedAt) {
    updateAssignmentData.returnedAt = returnedAt;
  }

  const jobUpdate: Record<string, unknown> = {
    repairPath: RepairPath.EXTERNAL,
    assignedToId: null,
  };

  if (nextStatus) {
    jobUpdate.status = nextStatus;
    if (nextStatus === JobStatus.COMPLETED) {
      jobUpdate.completedAt = new Date();
    }
  } else if (existing.status === JobStatus.DIAGNOSING) {
    jobUpdate.status = JobStatus.REFERRED;
  }

  try {
    await prisma.$transaction([
      prisma.oneTimeExternalTechAssignment.upsert({
        where: { jobId: payload.jobId },
        create: { jobId: payload.jobId, ...createAssignmentData },
        update: updateAssignmentData,
      }),
      prisma.job.update({ where: { id: payload.jobId }, data: jobUpdate }),
      prisma.auditLog.create({
        data: {
          jobId: payload.jobId,
          userId: session.user.id,
          action: "ONE_TIME_EXTERNAL_UPDATED",
          detail: JSON.stringify({ ...payload, assignedAt: payload.assignedDate }),
        },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("no such table") || message.toLowerCase().includes("onetimeexternaltechassignment")) {
      return { error: "One-time external assignments are not yet deployed to this database. Apply the latest schema changes and try again." };
    }
    return { error: "Failed to save one-time external assignment" };
  }

  revalidatePath(`/jobs/${payload.jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/dashboard");

  return { success: true };
}

export async function markMessagesReadAction(jobId: string): Promise<void> {
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) return;

  try {
    await prisma.inboundMessage.updateMany({
      where: { jobId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  } catch {
    // inboundMessage table may not exist yet on older deployments — safe to ignore
  }

  revalidatePath(`/jobs/${jobId}`);
}

export async function sendManualReplyAction(
  jobId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) {
    return { success: false, error: "Not authorised" };
  }

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 4000) {
    return { success: false, error: "Message must be between 1 and 4000 characters" };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { client: { select: { phone: true } } },
  });

  if (!job?.client?.phone) {
    return { success: false, error: "No client phone number on this job" };
  }

  const result = await enqueueWhatsAppMessage({
    to: job.client.phone,
    body: trimmed,
    type: "STAFF_REPLY",
    jobId,
  });

  if ("outboxId" in result && result.outboxId) {
    await deliverOutboundMessage(result.outboxId);
  }

  revalidatePath(`/jobs/${jobId}`);
  return { success: true };
}

async function sendPdfViaWhatsApp(opts: {
  jobId: string;
  userId: string;
  buffer: Buffer;
  filename: string;
  clientPhone: string;
  caption: string;
  outboxBody: string;
  auditAction: string;
  auditDetail: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const upload = await uploadWhatsAppMedia(opts.buffer, opts.filename, "application/pdf");
  if (!upload.ok) return { success: false, error: upload.error };

  const send = await sendWhatsAppDocument(opts.clientPhone, upload.mediaId, opts.filename, opts.caption);
  if (!send.success) return { success: false, error: send.error };

  await Promise.allSettled([
    enqueueWhatsAppMessage({
      to: opts.clientPhone,
      body: opts.outboxBody,
      type: "STAFF_REPLY",
      jobId: opts.jobId,
    }).catch(() => null),
    prisma.auditLog.create({
      data: {
        jobId: opts.jobId,
        userId: opts.userId,
        action: opts.auditAction,
        detail: JSON.stringify({ ...opts.auditDetail, messageId: send.messageId }),
      },
    }).catch(() => null),
  ]);

  revalidatePath(`/jobs/${opts.jobId}`);
  return { success: true };
}

export async function sendQuotationViaWhatsAppAction(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS", "FRONT_DESK"].includes(user.role)) {
    return { success: false, error: "Not authorised" };
  }
  const result = await generateQuotationBuffer(jobId, user.name, user.role, true, user.id);
  if (!result.ok) return { success: false, error: result.error };
  return sendPdfViaWhatsApp({
    jobId, userId: user.id,
    buffer: result.buffer, filename: result.filename, clientPhone: result.clientPhone,
    caption: `Please find your quotation (${result.quotationNumber}) attached. — Eagle Info Solutions`,
    outboxBody: `[Quotation PDF] ${result.quotationNumber}`,
    auditAction: "QUOTATION_SENT_WHATSAPP",
    auditDetail: { quotationNumber: result.quotationNumber },
  });
}

export async function sendInvoiceViaWhatsAppAction(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS"].includes(user.role) && !can.approveInvoices({ role: user.role, permissions: user.permissions })) {
    return { success: false, error: "Not authorised" };
  }
  const result = await generateInvoiceBuffer(jobId, user.name, user.role, user.id);
  if (!result.ok) return { success: false, error: result.error };
  return sendPdfViaWhatsApp({
    jobId, userId: user.id,
    buffer: result.buffer, filename: result.filename, clientPhone: result.clientPhone,
    caption: `Please find your invoice (${result.invoiceNumber}) attached. — Eagle Info Solutions`,
    outboxBody: `[Invoice PDF] ${result.invoiceNumber}`,
    auditAction: "INVOICE_SENT_WHATSAPP",
    auditDetail: { invoiceNumber: result.invoiceNumber },
  });
}

export async function sendJobCardViaWhatsAppAction(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const { user } = await getCurrentUserRole();
  if (!["ADMIN", "OPS"].includes(user.role) && !can.generateJobCards({ role: user.role, permissions: user.permissions })) {
    return { success: false, error: "Not authorised" };
  }
  const result = await generateJobCardBuffer(jobId, user.name, user.role, user.id);
  if (!result.ok) return { success: false, error: result.error };
  return sendPdfViaWhatsApp({
    jobId, userId: user.id,
    buffer: result.buffer, filename: result.filename, clientPhone: result.clientPhone,
    caption: `Please find your job card (${result.documentNumber}) attached. — Eagle Info Solutions`,
    outboxBody: `[Job Card PDF] ${result.documentNumber}`,
    auditAction: "JOB_CARD_SENT_WHATSAPP",
    auditDetail: { documentNumber: result.documentNumber },
  });
}
