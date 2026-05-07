import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgSessionOptional } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { sanitizeOptionalText, sanitizeText } from "@/lib/sanitize";
import { generateJobNumber } from "@/app/(app)/jobs/new/actions";
import { sendIntakeApprovalNotification, sendIntakeRejectionNotification, sendJobCreatedNotification } from "@/lib/notifications/whatsapp";

const ALLOWED_STATUSES = ["APPROVED", "REJECTED", "CONVERTED_TO_JOB"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, user, orgId } = await getOrgSessionOptional();
  if (!user || !can.viewClientInfo(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body as { status: string };

  if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const req = await prisma.repairRequest.findFirst({ where: { id, ...(orgId ? { orgId } : {}) } });
  if (!req) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  /* ── Convert to Job ── */
  if (status === "CONVERTED_TO_JOB") {
    // 1. Upsert client by phone
    const client = orgId
      ? await prisma.client.upsert({
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
        })
      : await prisma.client.upsert({
          where: { id: (await prisma.client.findFirst({ where: { phone: req.phone } }))?.id ?? "" },
          create: {
            fullName: sanitizeText(req.customerName),
            phone: req.phone,
            email: sanitizeOptionalText(req.email) ?? undefined,
          },
          update: {
            fullName: sanitizeText(req.customerName),
            email: sanitizeOptionalText(req.email) ?? undefined,
          },
        });

    // 2. Create job (retry on duplicate job number)
    let job: { id: string; jobNumber: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const jobNumber = await generateJobNumber(orgId ?? undefined);
      try {
        job = await prisma.job.create({
          data: {
            ...(orgId ? { orgId } : {}),
            jobNumber,
            clientId: client.id,
            createdById: session!.user.id,
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
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          continue;
        }
        throw err;
      }
    }

    if (!job) {
      return NextResponse.json({ error: "Could not allocate job number. Please retry." }, { status: 500 });
    }

    // 3. Audit log
    await prisma.auditLog.create({
      data: {
        jobId: job.id,
        userId: session!.user.id,
        action: "JOB_CREATED",
        detail: JSON.stringify({ status: "RECEIVED", sourceRequest: req.requestNumber }),
      },
    });

    // 4. Mark request as converted and store linked job ID
    await prisma.repairRequest.update({
      where: { id },
      data: { requestStatus: "CONVERTED_TO_JOB", linkedJobId: job.id },
    });

    // Send WhatsApp notification (non-blocking)
    sendJobCreatedNotification(req.phone, req.customerName, job.jobNumber).catch((err) =>
      console.error("[Intake] WhatsApp notification failed:", err)
    );

    return NextResponse.json({
      success: true,
      requestStatus: "CONVERTED_TO_JOB",
      jobId: job.id,
      jobNumber: job.jobNumber,
    });
  }

  /* ── Approve / Reject ── */
  const updated = await prisma.repairRequest.update({
    where: { id },
    data: { requestStatus: status as AllowedStatus },
  });

  // Send WhatsApp notification (non-blocking)
  if (status === "APPROVED") {
    sendIntakeApprovalNotification(
      updated.phone,
      updated.customerName,
      updated.requestNumber,
      updated.preferredDropoffDate
    ).catch((err) => console.error("[Intake] WhatsApp notification failed:", err));
  } else if (status === "REJECTED") {
    sendIntakeRejectionNotification(
      updated.phone,
      updated.customerName,
      updated.requestNumber
    ).catch((err) => console.error("[Intake] WhatsApp notification failed:", err));
  }

  return NextResponse.json({ success: true, requestStatus: updated.requestStatus });
}
