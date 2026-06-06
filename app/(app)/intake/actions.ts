"use server";

import { Prisma, RepairRequestStatus, Role, DeviceType, HandoverMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { generateJobNumber } from "@/app/(app)/jobs/new/actions";
import { checkJobLimit } from "@/lib/plan-limits";
import {
  sendIntakeApprovalNotification,
  sendIntakeRejectionNotification,
  sendJobCreatedNotification,
} from "@/lib/notifications/whatsapp";
import { notifyRepairRequestReceived, notifyJobCreated } from "@/lib/notifications";

const listSchema = z.object({
  take: z.coerce.number().int().positive().max(500).optional(),
});

export async function listRepairRequestsAction(input?: { take?: number }) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewIntake(user)) return { error: "Forbidden" } as const;

  const parsed = listSchema.safeParse(input ?? {});
  const take = parsed.success ? parsed.data.take ?? 200 : 200;

  const requests = await prisma.repairRequest.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take,
  });

  return { success: true as const, requests };
}

export async function readRepairRequestAction(id: string) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewIntake(user)) return { error: "Forbidden" } as const;

  const req = await prisma.repairRequest.findFirst({ where: { id, orgId } });
  if (!req) return { error: "Not found" } as const;
  return { success: true as const, request: req };
}

const updateDetailsSchema = z.object({
  id: z.string().min(1),
  customerName: z.string().min(1).max(200).optional(),
  phone: z.string().min(5).max(32).optional(),
  email: z.string().email().optional().or(z.literal("")),
  deviceType: z.nativeEnum(DeviceType).optional(),
  brand: z.string().min(1).max(120).optional(),
  model: z.string().max(120).optional().or(z.literal("")),
  serialNumber: z.string().max(120).optional().or(z.literal("")),
  handoverMethod: z.nativeEnum(HandoverMethod).optional(),
  problemDescription: z.string().min(1).max(5000).optional(),
});

export async function updateRepairRequestDetailsAction(formData: FormData) {
  const { user, orgId, org } = await requireOrgSession();
  if (!can.manageIntake(user)) return { error: "Forbidden" } as const;
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  // FormData.get returns null when missing; Zod optional() expects undefined.
  const get = (key: string) => formData.get(key) ?? undefined;

  const payload = updateDetailsSchema.safeParse({
    id: get("id"),
    customerName: get("customerName"),
    phone: get("phone"),
    email: get("email"),
    deviceType: get("deviceType"),
    brand: get("brand"),
    model: get("model"),
    serialNumber: get("serialNumber"),
    handoverMethod: get("handoverMethod"),
    problemDescription: get("problemDescription"),
  });

  if (!payload.success) {
    return { error: payload.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const data: Prisma.RepairRequestUpdateInput = {};
  if (payload.data.customerName !== undefined) data.customerName = sanitizeText(payload.data.customerName);
  if (payload.data.phone !== undefined) data.phone = sanitizeText(payload.data.phone);
  if (payload.data.email !== undefined) data.email = sanitizeOptionalText(payload.data.email) || null;
  if (payload.data.deviceType !== undefined) data.deviceType = payload.data.deviceType;
  if (payload.data.brand !== undefined) data.brand = sanitizeText(payload.data.brand);
  if (payload.data.model !== undefined) data.model = sanitizeOptionalText(payload.data.model) || null;
  if (payload.data.serialNumber !== undefined) data.serialNumber = sanitizeOptionalText(payload.data.serialNumber) || null;
  if (payload.data.handoverMethod !== undefined) data.handoverMethod = payload.data.handoverMethod;
  if (payload.data.problemDescription !== undefined) data.problemDescription = sanitizeText(payload.data.problemDescription);

  const existing = await prisma.repairRequest.findFirst({
    where: { id: payload.data.id, orgId },
    select: { id: true, requestStatus: true, linkedJobId: true },
  });

  if (!existing) return { error: "Not found" } as const;

  const updated = await prisma.repairRequest.update({ where: { id: payload.data.id }, data });

  // If the request was converted, keep the linked Job in sync for key intake fields.
  if (existing.requestStatus === "CONVERTED_TO_JOB" && existing.linkedJobId) {
    const jobData: Record<string, unknown> = {};
    if (payload.data.deviceType !== undefined) jobData.deviceType = payload.data.deviceType;
    if (payload.data.brand !== undefined) jobData.brand = sanitizeText(payload.data.brand);
    if (payload.data.model !== undefined) jobData.model = sanitizeText(payload.data.model);
    if (payload.data.serialNumber !== undefined) {
      jobData.serialOrImei = sanitizeOptionalText(payload.data.serialNumber) ?? null;
    }
    if (payload.data.problemDescription !== undefined) {
      jobData.issueDescription = sanitizeText(payload.data.problemDescription);
    }

    if (Object.keys(jobData).length > 0) {
      await prisma.$transaction([
        prisma.job.update({ where: { id: existing.linkedJobId, orgId }, data: jobData }),
        prisma.auditLog.create({
          data: {
            jobId: existing.linkedJobId,
            userId: user.id,
            action: "JOB_SYNCED_FROM_REQUEST",
            detail: JSON.stringify({ requestId: existing.id, fields: Object.keys(jobData) }),
            orgId,
          },
        }),
      ]);
      revalidatePath(`/jobs/${existing.linkedJobId}`);
      revalidatePath("/jobs");
    }
  }

  revalidatePath("/intake");
  return { success: true as const, request: updated };
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(RepairRequestStatus),
});

export async function setRepairRequestStatusAction(input: { id: string; status: RepairRequestStatus }) {
  const { session, user, orgId, org } = await requireOrgSession();
  if (!can.manageIntake(user)) return { error: "Forbidden" } as const;
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid status" } as const;

  const req = await prisma.repairRequest.findFirst({ where: { id: parsed.data.id, orgId } });
  if (!req) return { error: "Request not found" } as const;

  // Convert to Job
  if (parsed.data.status === "CONVERTED_TO_JOB") {
    const limit = await checkJobLimit(orgId);
    if (!limit.allowed) return { error: limit.reason } as const;

    const client = await prisma.client.upsert({
      where: { phone_orgId: { orgId, phone: req.phone } },
      create: {
        orgId,
        fullName: sanitizeText(req.customerName),
        phone: req.phone,
        email: sanitizeOptionalText(req.email) ?? undefined,
      },
      update: {
        fullName: sanitizeText(req.customerName),
        email: sanitizeOptionalText(req.email) ?? undefined,
      },
    });

    let job: { id: string; jobNumber: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const jobNumber = await generateJobNumber(orgId);
      try {
        job = await prisma.job.create({
          data: {
            orgId,
            jobNumber,
            clientId: client.id,
            createdById: session.user.id,
            deviceType: req.deviceType,
            brand: sanitizeText(req.brand),
            model: sanitizeText(req.model ?? ""),
            serialOrImei: sanitizeOptionalText(req.serialNumber) ?? undefined,
            issueDescription: sanitizeText(req.problemDescription),
          },
          select: { id: true, jobNumber: true },
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }

    if (!job) return { error: "Could not allocate job number. Please retry." } as const;

    await prisma.auditLog.create({
      data: {
        jobId: job.id,
        userId: session.user.id,
        action: "JOB_CREATED",
        detail: JSON.stringify({ status: "RECEIVED", sourceRequest: req.requestNumber }),
        orgId,
      },
    });

    await prisma.repairRequest.update({
      where: { id: req.id },
      data: { requestStatus: "CONVERTED_TO_JOB", linkedJobId: job.id },
    });

    // Non-blocking WhatsApp
    sendJobCreatedNotification(req.phone, req.customerName, job.jobNumber, orgId).catch((err) =>
      console.error("[Intake] WhatsApp notification failed:", err),
    );
    notifyJobCreated({
      orgId,
      jobNumber: job.jobNumber,
      clientName: req.customerName,
      deviceLabel: `${req.brand} ${req.model ?? ""}`.trim() || "Device",
      actorName: user.name ?? user.email ?? "Staff",
    }).catch(() => {});

    revalidatePath("/intake");
    return {
      success: true as const,
      requestStatus: "CONVERTED_TO_JOB" as const,
      jobId: job.id,
      jobNumber: job.jobNumber,
    };
  }

  // Approve / Reject / Pending
  const updated = await prisma.repairRequest.update({
    where: { id: req.id },
    data: { requestStatus: parsed.data.status },
  });

  if (parsed.data.status === "APPROVED") {
    sendIntakeApprovalNotification(
      updated.phone,
      updated.customerName,
      updated.requestNumber,
      updated.preferredDropoffDate,
      orgId,
    ).catch((err) => console.error("[Intake] WhatsApp notification failed:", err));
  }

  if (parsed.data.status === "REJECTED") {
    sendIntakeRejectionNotification(updated.phone, updated.customerName, updated.requestNumber, orgId).catch((err) =>
      console.error("[Intake] WhatsApp notification failed:", err),
    );
  }

  revalidatePath("/intake");
  return { success: true as const, requestStatus: updated.requestStatus };
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function deleteRepairRequestAction(formData: FormData) {
  const { user, orgId, org } = await requireOrgSession();
  if (user.role !== Role.ADMIN) return { error: "Forbidden" } as const;
  assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid request" } as const;

  const existing = await prisma.repairRequest.findFirst({ where: { id: parsed.data.id, orgId } });
  if (!existing) return { success: true as const };

  if (existing.requestStatus === "CONVERTED_TO_JOB") {
    return { error: "Cannot delete: request is already converted to a job." } as const;
  }

  await prisma.repairRequest.deleteMany({ where: { id: parsed.data.id, orgId } });
  revalidatePath("/intake");
  return { success: true as const };
}
