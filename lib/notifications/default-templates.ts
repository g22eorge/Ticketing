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
  metaTemplateName?: string;
  metaLanguageCode?: string;
}> {
  return [
    {
      key: "REPAIR_REQUEST_CONFIRMATION",
      channel: "WHATSAPP",
      label: "Service request confirmation",
      metaTemplateName: "service_request_confirmation",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Thank you for submitting your service request ({requestNumber}).",
        "",
        "Your request has been received and logged successfully. Our team will contact you shortly with the next steps.",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_APPROVED",
      channel: "WHATSAPP",
      label: "Intake approved",
      metaTemplateName: "front_desk_approved",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Your service request ({requestNumber}) has been approved.",
        "",
        "Please contact us or visit the service desk for the next step.",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "FRONT_DESK_REJECTED",
      channel: "WHATSAPP",
      label: "Intake rejected",
      metaTemplateName: "front_desk_rejected",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Unfortunately, we are unable to process your service request ({requestNumber}) at this time.",
        "",
        "Please contact us for more information.",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "JOB_CREATED",
      channel: "WHATSAPP",
      label: "Ticket created",
      metaTemplateName: "ticket_created",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Your ticket has been registered as #{jobNumber}.",
        "",
        "We will update you as work progresses.",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "JOB_COMPLETED",
      channel: "WHATSAPP",
      label: "Ticket completed",
      metaTemplateName: "ticket_completed",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Good news. Ticket #{jobNumber} is ready for pickup or completion.",
        "",
        "Please contact us if you need delivery or collection support.",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "WHATSAPP",
      label: "Ticket status update (WhatsApp)",
      metaTemplateName: "ticket_status_update",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Update on ticket #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "JOB_STATUS_UPDATE",
      channel: "EMAIL",
      label: "Ticket status update (Email)",
      subject: "Update on ticket #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Update on ticket #{jobNumber}:",
        "Status: {newStatusLabel}",
        "",
        "Best regards,",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 1)",
      metaTemplateName: "ready_for_pickup_nudge_1",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Reminder: Ticket #{jobNumber} is ready for pickup or completion.",
        "",
        "Please visit us to collect it.",
        "",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_1",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 1) (Email)",
      subject: "Pickup reminder: ticket #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Reminder: Ticket #{jobNumber} is ready for pickup or completion.",
        "",
        "Please visit us to collect it.",
        "",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "WHATSAPP",
      label: "Ready for pickup (nudge 2)",
      metaTemplateName: "ready_for_pickup_nudge_2",
      metaLanguageCode: "en",
      body: [
        "Hello {customerName},",
        "",
        "Final reminder: Ticket #{jobNumber} is still ready for pickup or completion.",
        "",
        "If you need delivery, reply and we will advise.",
        "",
        "Service Team",
      ].join("\n"),
    },
    {
      key: "READY_FOR_PICKUP_NUDGE_2",
      channel: "EMAIL",
      label: "Ready for pickup (nudge 2) (Email)",
      subject: "Final pickup reminder: ticket #{jobNumber}",
      body: [
        "Hello {customerName},",
        "",
        "Final reminder: Ticket #{jobNumber} is still ready for pickup or completion.",
        "",
        "If you need delivery, reply and we will advise.",
        "",
        "Service Team",
      ].join("\n"),
    },
  ];
}

export async function upsertDefaultCommunicationTemplates(orgId?: string) {
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

      const updateData = {
        label: t.label,
        subject: t.subject ?? null,
        body: t.body,
        variables: variables.length ? JSON.stringify(variables) : null,
        metaTemplateName: t.metaTemplateName ?? null,
        metaLanguageCode: t.metaTemplateName ? (t.metaLanguageCode ?? "en") : null,
        isActive: true,
      };

      if (orgId) {
        await prisma.communicationTemplate.upsert({
          where: { key_channel_orgId: { key: t.key, channel: t.channel, orgId } },
          update: updateData,
          create: { orgId, key: t.key, channel: t.channel, ...updateData },
        });
      } else {
        const existing = await prisma.communicationTemplate.findFirst({
          where: { key: t.key, channel: t.channel, orgId: null },
          select: { id: true },
        });
        if (existing) {
          await prisma.communicationTemplate.update({ where: { id: existing.id }, data: updateData });
        } else {
          await prisma.communicationTemplate.create({ data: { key: t.key, channel: t.channel, ...updateData } });
        }
      }
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

export async function upsertDefaultCommunicationPolicies(orgId?: string) {
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
      const policyUpdateData = {
        dashboardEnabled: true,
        whatsappEnabled: false,
        emailEnabled: false,
        templateKey: defaults.templateKey,
        nudge1Hours: defaults.nudge1Hours,
        nudge2Hours: defaults.nudge2Hours,
      };

      if (orgId) {
        await prisma.communicationPolicy.upsert({
          where: { status_orgId: { status: normalized as unknown as PrismaJobStatus, orgId } },
          update: policyUpdateData,
          create: { orgId, status: normalized as unknown as PrismaJobStatus, ...policyUpdateData },
        });
      } else {
        const existingPolicy = await prisma.communicationPolicy.findFirst({
          where: { status: normalized as unknown as PrismaJobStatus, orgId: null },
          select: { id: true },
        });
        if (existingPolicy) {
          await prisma.communicationPolicy.update({ where: { id: existingPolicy.id }, data: policyUpdateData });
        } else {
          await prisma.communicationPolicy.create({ data: { status: normalized as unknown as PrismaJobStatus, ...policyUpdateData } });
        }
      }
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
