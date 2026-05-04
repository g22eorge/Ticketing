import { JobStatus as PrismaJobStatus, OutboundMessageChannel, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { UI_JOB_STATUSES, normalizeJobStatus } from "@/lib/job-status";

function supportsCommsTemplates() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationTemplate"));
}

function supportsCommunicationPolicy() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationPolicy"));
}

export function getDefaultCommunicationTemplates(): Array<{
  key: string;
  channel: OutboundMessageChannel;
  label: string;
  subject?: string | null;
  body: string;
}> {
  return [
    {
      key: "REPAIR_REQUEST_CONFIRMATION",
      channel: "WHATSAPP",
      label: "Repair request confirmation",
      body: [
        "Hello {customerName},",
        "",
        "Thank you for submitting your repair request ({requestNumber}).",
        "",
        "We have received your device and will contact you shortly to confirm the diagnosis and timeline.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_APPROVED",
      channel: "WHATSAPP",
      label: "Intake approved",
      body: [
        "Hello {customerName},",
        "",
        "Your repair request ({requestNumber}) has been APPROVED.",
        "",
        "Please bring your device to our shop at your convenience.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_REJECTED",
      channel: "WHATSAPP",
      label: "Intake rejected",
      body: [
        "Hello {customerName},",
        "",
        "Unfortunately, we are unable to process your repair request ({requestNumber}) at this time.",
        "",
        "Please contact us for more information.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_CREATED",
      channel: "WHATSAPP",
      label: "Job created",
      body: [
        "Hello {customerName},",
        "",
        "Your device has been registered as Job #{jobNumber}.",
        "",
        "We will update you as the repair progresses.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_COMPLETED",
      channel: "WHATSAPP",
      label: "Job completed",
      body: [
        "Hello {customerName},",
        "",
        "Great news! Your device (Job #{jobNumber}) is ready for pickup.",
        "",
        "Please visit our shop to collect your device.",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "WHATSAPP",
      label: "Generic job status update (WhatsApp)",
      body: [
        "Hello {customerName},",
        "",
        "Update on Job #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "EMAIL",
      label: "Generic job status update (Email)",
      subject: "Update on Job #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Update on Job #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 1)",
      body: [
        "Hello {customerName},",
        "",
        "Reminder: Your device for Job #{jobNumber} is ready for pickup.",
        "",
        "Please visit us to collect it.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 1) (Email)",
      subject: "Pickup reminder: Job #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Reminder: Your device for Job #{jobNumber} is ready for pickup.",
        "",
        "Please visit us to collect it.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 2)",
      body: [
        "Hello {customerName},",
        "",
        "Final reminder: Job #{jobNumber} is still ready for pickup.",
        "",
        "If you need delivery, reply and we will advise.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 2) (Email)",
      subject: "Final pickup reminder: Job #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Final reminder: Job #{jobNumber} is still ready for pickup.",
        "",
        "If you need delivery, reply and we will advise.",
        "",
        "Eagle Info Solutions",
      ].join("\n"),
    },
  ];
}

export async function upsertDefaultCommunicationTemplates() {
  if (!supportsCommsTemplates()) {
    return { ok: false as const, reason: "CommunicationTemplate model not available" };
  }

  const templates = getDefaultCommunicationTemplates();
  let upserted = 0;

  try {
    for (const t of templates) {
      const variables = [...new Set((`${t.subject ?? ""}\n${t.body}`).match(/\{([a-zA-Z0-9_]+)\}/g) ?? [])]
        .map((v) => v.replaceAll("{", "").replaceAll("}", ""))
        .sort();

      await prisma.communicationTemplate.upsert({
        where: { key_channel: { key: t.key, channel: t.channel } },
        update: {
          label: t.label,
          subject: t.subject ?? null,
          body: t.body,
          variables: variables.length ? JSON.stringify(variables) : null,
          isActive: true,
        },
        create: {
          key: t.key,
          channel: t.channel,
          label: t.label,
          subject: t.subject ?? null,
          body: t.body,
          variables: variables.length ? JSON.stringify(variables) : null,
          isActive: true,
        },
      });
      upserted += 1;
    }

    return { ok: true as const, upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Most common prod failure: DB not migrated yet, so the table doesn't exist.
    if (message.toLowerCase().includes("no such table") || message.toLowerCase().includes("does not exist")) {
      return {
        ok: false as const,
        reason: "Database schema missing CommunicationTemplate table. Apply migrations/db push, then retry.",
        detail: message,
      };
    }
    return { ok: false as const, reason: "Failed to seed templates", detail: message };
  }
}

export async function upsertDefaultCommunicationPolicies() {
  if (!supportsCommunicationPolicy()) {
    return { ok: false as const, reason: "CommunicationPolicy model not available" };
  }

  const statuses = UI_JOB_STATUSES;

  const defaultsForStatus = (status: (typeof statuses)[number]) => {
    if (status === "READY_FOR_PICKUP") {
      return { templateKey: "READY_FOR_PICKUP_NUDGE_1", nudge1Hours: 24, nudge2Hours: 72 };
    }
    if (status === "COMPLETED") {
      return { templateKey: "JOB_COMPLETED", nudge1Hours: null, nudge2Hours: null };
    }
    if (status === "RECEIVED") {
      return { templateKey: "JOB_CREATED", nudge1Hours: null, nudge2Hours: null };
    }
    return { templateKey: "JOB_STATUS_UPDATE", nudge1Hours: null, nudge2Hours: null };
  };

  let upserted = 0;
  try {
    for (const status of statuses) {
      // Extra safety: ensure we only ever seed normalized/UI statuses.
      const normalized = normalizeJobStatus(status);
      const defaults = defaultsForStatus(normalized);
      await prisma.communicationPolicy.upsert({
        where: { status: normalized as unknown as PrismaJobStatus },
        update: {
          dashboardEnabled: true,
          whatsappEnabled: false,
          emailEnabled: false,
          templateKey: defaults.templateKey,
          nudge1Hours: defaults.nudge1Hours,
          nudge2Hours: defaults.nudge2Hours,
        },
        create: {
          status: normalized as unknown as PrismaJobStatus,
          dashboardEnabled: true,
          whatsappEnabled: false,
          emailEnabled: false,
          templateKey: defaults.templateKey,
          nudge1Hours: defaults.nudge1Hours,
          nudge2Hours: defaults.nudge2Hours,
        },
      });
      upserted += 1;
    }
    return { ok: true as const, upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("no such table") || message.toLowerCase().includes("does not exist")) {
      return {
        ok: false as const,
        reason: "Database schema missing CommunicationPolicy table. Apply migrations/db push, then retry.",
        detail: message,
      };
    }
    return { ok: false as const, reason: "Failed to seed policies", detail: message };
  }
}
