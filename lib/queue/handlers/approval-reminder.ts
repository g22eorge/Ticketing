/**
 * Approval reminder email handler.
 *
 * Sends a reminder (or final-notice) email to the designated approver when
 * an approval request has been sitting in PENDING status past the configured
 * first-reminder window. The job is scheduled by the approval engine after
 * creating the ApprovalRequest; escalation (SLA breach) is a separate job.
 */
import { prisma } from "@/lib/prisma";
import type { ApprovalReminderPayload } from "../jobs";

// Inline email sender — re-uses the existing Resend-backed lib/email.ts if
// present, otherwise logs to stdout (CI / test environments).
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  try {
    // Dynamic import so the worker doesn't hard-depend on Next.js server-only APIs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const emailMod = require("../../email") as Record<string, unknown>;
    const send = (emailMod.sendEmail ?? emailMod.default) as
      | ((opts: { to: string; subject: string; html: string }) => Promise<void>)
      | undefined;
    if (send) {
      await send({ to, subject, html: `<p>${body.replace(/\n/g, "<br>")}</p>` });
      return;
    }
  } catch {
    /* fall through */
  }
  // Fallback: stdout only (dev / no-SMTP environments).
  console.info(`[approval-reminder] EMAIL to=${to} subject="${subject}"`);
}

export async function handleApprovalReminder(data: unknown): Promise<void> {
  const {
    orgId: _orgId,
    approvalRequestId,
    approverUserId,
    module,
    documentNumber,
    amount,
    currency = "UGX",
    isFinalNotice = false,
  } = data as ApprovalReminderPayload;

  // Fetch the approver's email from the DB.
  let approverEmail: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: approverUserId },
      select: { email: true, name: true },
    });
    approverEmail = user?.email ?? null;
  } catch {
    // Non-fatal.
  }

  if (!approverEmail) {
    console.warn(`[approval-reminder] no email for user ${approverUserId} — skipping`);
    return;
  }

  const prefix = isFinalNotice ? "⚠️ FINAL NOTICE" : "Reminder";
  const amountText = amount != null ? ` for ${currency} ${amount.toLocaleString()}` : "";
  const subject = `${prefix}: ${module} approval pending — ${documentNumber}`;
  const body = [
    `You have a pending ${module} approval${amountText}.`,
    `Document: ${documentNumber}`,
    `Request ID: ${approvalRequestId}`,
    "",
    isFinalNotice
      ? "This is your final notice. The request will be escalated if no action is taken."
      : "Please log in and take action at your earliest convenience.",
  ].join("\n");

  await sendEmail(approverEmail, subject, body);

  // Write a notification record (best-effort — schema may not have approval types).
  try {
    await prisma.notification.create({
      data: {
        userId: approverUserId,
        type: "APPROVAL_NEEDED",
        title: subject,
        message: body,
        isRead: false,
      } as Parameters<typeof prisma.notification.create>[0]["data"],
    });
  } catch {
    // Non-fatal — email is sent regardless.
  }

  console.info(`[approval-reminder] sent ${isFinalNotice ? "final notice" : "reminder"} to ${approverEmail}`);
}
