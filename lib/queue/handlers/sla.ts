/**
 * SLA escalation handlers.
 *
 * Three job types:
 *   1. sla:approval-escalate  — approval request has breached its SLA and must
 *      be escalated to the configured backup approver.
 *   2. sla:repair-overdue     — a repair job has not progressed within the SLA
 *      window and must be flagged to the technical manager.
 *   3. sla:po-overdue         — a purchase order expected delivery date has
 *      passed without a GRN being raised.
 */
import { prisma } from "@/lib/prisma";
import { enqueue } from "../index";
import { Jobs } from "../jobs";
import type {
  SlaEscalatePayload,
  SlaRepairOverduePayload,
  SlaPoOverduePayload,
  NotificationSendPayload,
} from "../jobs";

// ── 1. Approval escalation ────────────────────────────────────────────────────

export async function handleSlaEscalate(data: unknown): Promise<void> {
  const { orgId, approvalRequestId, level, escalateTo } = data as SlaEscalatePayload;

  // Mark the stalled step as escalated.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    if (db.approvalRequestStep) {
      await db.approvalRequestStep.updateMany({
        where: { approvalRequestId, levelNumber: level, status: "PENDING" },
        data: { status: "ESCALATED", escalatedTo: escalateTo },
      });
    }
  } catch {
    // Table not yet migrated — log and continue.
  }

  // Notify escalatee.
  await enqueue<NotificationSendPayload>(Jobs.NOTIFICATION_SEND, {
    orgId,
    userId: escalateTo,
    channel: "in_app",
    subject: "Approval escalated to you",
    body: `Approval request #${approvalRequestId} has been escalated to you because the previous approver exceeded the SLA.`,
    meta: { approvalRequestId, level },
  });

  console.info(`[sla-handler] escalated approval ${approvalRequestId} level=${level} to ${escalateTo}`);
}

// ── 2. Repair overdue ─────────────────────────────────────────────────────────

export async function handleSlaRepairOverdue(data: unknown): Promise<void> {
  const { orgId, jobId, assignedTo, managerId } = data as SlaRepairOverduePayload;

  // Add an audit entry to the job (best-effort — schema shape may vary).
  try {
    await prisma.auditLog.create({
      data: {
        jobId,
        userId: managerId,
        action: "SLA_BREACH",
        detail: "Repair job SLA breached — escalated to technical manager.",
      } as Parameters<typeof prisma.auditLog.create>[0]["data"],
    });
  } catch {
    // AuditLog schema may differ — non-fatal.
  }

  // Notify manager.
  await enqueue<NotificationSendPayload>(Jobs.NOTIFICATION_SEND, {
    orgId,
    userId: managerId,
    channel: "in_app",
    subject: "Repair job overdue",
    body: `Job ${jobId} assigned to ${assignedTo} has exceeded its SLA. Please review.`,
    meta: { jobId, assignedTo },
  });

  console.info(`[sla-handler] repair overdue jobId=${jobId}`);
}

// ── 3. PO overdue ─────────────────────────────────────────────────────────────

export async function handleSlaPoOverdue(data: unknown): Promise<void> {
  const { orgId, poId, poNumber, supplierId } = data as SlaPoOverduePayload;

  // Best-effort audit log — shape varies by schema version.
  // PO overdue is logged via SystemAuditEvent if AuditLog requires a Job.
  try {
    await (prisma as unknown as { systemAuditEvent: { create: (a: unknown) => Promise<unknown> } })
      .systemAuditEvent?.create({
        data: {
          action: "SLA_BREACH",
          detail: `PO ${poNumber} expected delivery date passed without GRN.`,
          entityType: "PurchaseOrder",
          entityId: poId,
        },
      });
  } catch {
    // Non-fatal.
  }

  console.info(`[sla-handler] PO overdue poId=${poId} supplier=${supplierId}`);
}
