import { prisma } from "@/lib/prisma";
import { JobStatus, NotificationChannel, NotificationType, OutboundMessageType, Prisma } from "@prisma/client";

import { formatMoney } from "@/lib/currency";
import { normalizeJobStatus, type JobStatus as LegacyJobStatus } from "@/lib/job-status";
import { renderCommunicationTemplate } from "@/lib/notifications/templates";
import { deliverOutboundMessage, enqueueEmailMessage, enqueueWhatsAppMessage } from "@/lib/notifications/whatsapp-outbox";
import { sendCustomWhatsAppMessage } from "@/lib/notifications/whatsapp";

interface CreateNotificationParams {
  orgId: string;
  type: NotificationType;
  title: string;
  message: string;
  jobId?: string;
  userId?: string;
  channel?: NotificationChannel;
}

export async function createNotification({
  orgId,
  type,
  title,
  message,
  jobId,
  userId,
  channel = NotificationChannel.DASHBOARD,
}: CreateNotificationParams) {
  return prisma.notification.create({
    data: {
      type,
      title,
      message,
      jobId,
      userId,
      channel,
      orgId,
    },
  });
}

export async function createNotificationsForRole({
  orgId,
  type,
  title,
  message,
  jobId,
  roles,
}: {
  orgId: string;
  type: NotificationType;
  title: string;
  message: string;
  jobId?: string;
  roles: ("ADMIN" | "OPS" | "TECHNICIAN_INTERNAL" | "TECHNICIAN_EXTERNAL")[];
}) {
  const users = await prisma.user.findMany({
    where: {
      orgId,
      role: { in: roles },
      isActive: true,
    },
    select: { id: true },
  });

  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((user) => ({
      type,
      title,
      message,
      jobId,
      userId: user.id,
      channel: NotificationChannel.DASHBOARD,
      orgId,
    })),
  });
}

export async function getUnreadNotifications(userId: string, limit = 20, opts?: { includeClient?: boolean }) {
  const includeClient = opts?.includeClient ?? false;
  return prisma.notification.findMany({
    where: {
      userId,
      isRead: false,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      job: {
        select: {
          id: true,
          jobNumber: true,
          ...(includeClient ? { client: { select: { fullName: true, phone: true } } } : {}),
        },
      },
    },
  });
}

export async function getAllNotifications(userId: string, limit = 50, opts?: { includeClient?: boolean }) {
  const includeClient = opts?.includeClient ?? false;
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      job: {
        select: {
          id: true,
          jobNumber: true,
          ...(includeClient ? { client: { select: { fullName: true, phone: true } } } : {}),
        },
      },
    },
  });
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

export async function getUserPreferences(userId: string) {
  let prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
  });

  if (!prefs) {
    prefs = await prisma.notificationPreferences.create({
      data: { userId },
    });
  }

  return prefs;
}

export async function updateUserPreferences(
  userId: string,
  data: {
    notifyStatusChange?: boolean;
    notifyApprovalNeeded?: boolean;
    notifyJobAssigned?: boolean;
    notifyEstimateSubmitted?: boolean;
    notifyPaymentReceived?: boolean;
    notifyPayoutGenerated?: boolean;
    notifyTimelineUpdated?: boolean;
    notifyDelayNote?: boolean;
    whatsappEnabled?: boolean;
    emailEnabled?: boolean;
  }
) {
  return prisma.notificationPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function notifyStatusChange(
  orgId: string,
  jobId: string,
  oldStatus: JobStatus,
  newStatus: JobStatus,
  jobNumber: string,
  clientName: string
) {
  // Best-effort: cancel READY_FOR_PICKUP nudges when the status changes away.
  if (oldStatus === JobStatus.READY_FOR_PICKUP && newStatus !== JobStatus.READY_FOR_PICKUP) {
    await cancelReadyForPickupNudges(jobId, "BOTH");
  }

  const prefs = await getUserPreferencesForRoles(orgId, ["ADMIN", "OPS"]);
  const targetRoles = prefs.filter((p) => p.notifyStatusChange).map((p) => p.userId);
  const title = "Status Changed";
  const message = `Job ${jobNumber} (${clientName}) status changed from ${oldStatus.replaceAll("_", " ")} to ${newStatus.replaceAll("_", " ")}`;

  const policy = await getCommunicationPolicyForStatus(orgId, newStatus);
  const dashboardEnabled = policy?.dashboardEnabled ?? true;

  if (dashboardEnabled && targetRoles.length > 0) {
    await prisma.notification.createMany({
      data: targetRoles.map((userId) => ({
        type: NotificationType.STATUS_CHANGE,
        title,
        message,
        jobId,
        userId,
        channel: NotificationChannel.DASHBOARD,
        orgId,
      })),
    });
  }

  // If policies are enabled and WhatsApp is configured for this status, send via template/outbox.
  // Otherwise, preserve legacy behavior (READY_FOR_PICKUP only, preference-gated).
  if (policy?.whatsappEnabled) {
    await sendClientWhatsAppForStatusChange({ orgId, jobId, jobNumber, oldStatus, newStatus, templateKey: policy.templateKey ?? null });
    if (newStatus === JobStatus.READY_FOR_PICKUP) {
      await scheduleReadyForPickupNudges({
        orgId,
        jobId,
        jobNumber,
        nudge1Hours: policy.nudge1Hours,
        nudge2Hours: policy.nudge2Hours,
        templateKey: policy.templateKey ?? null,
      });
    }
  } else if (newStatus === JobStatus.READY_FOR_PICKUP) {
    const client = await prisma.client.findFirst({
      where: { orgId, jobs: { some: { id: jobId } } },
      select: { phone: true, fullName: true },
    });

    if (client?.phone && prefs.some((p) => p.whatsappEnabled)) {
      await sendCustomWhatsAppMessage(
        client.phone,
        `Hi ${client.fullName}, your device for job ${jobNumber} is ready for pickup. Please visit us to collect it. - Your Repair Team`,
      );
    }
  }

  // Email: status-change messages and optional nudges.
  if (policy?.emailEnabled) {
    await sendClientEmailForStatusChange({ orgId, jobId, jobNumber, oldStatus, newStatus, templateKey: policy.templateKey ?? null });
    if (newStatus === JobStatus.READY_FOR_PICKUP) {
      await scheduleReadyForPickupEmailNudges({
        orgId,
        jobId,
        jobNumber,
        nudge1Hours: policy.nudge1Hours,
        nudge2Hours: policy.nudge2Hours,
        templateKey: policy.templateKey ?? null,
      });
    }
  }
}

function supportsCommunicationPolicy() {
  return Boolean(Prisma.dmmf.datamodel.models.find((m) => m.name === "CommunicationPolicy"));
}

async function getCommunicationPolicyForStatus(orgId: string, status: JobStatus) {
  if (!supportsCommunicationPolicy()) return null;
  try {
    const normalized = normalizeJobStatus(status as unknown as LegacyJobStatus);
    return (
      (await prisma.communicationPolicy.findFirst({ where: { orgId, status: normalized as JobStatus } })) ??
      (await prisma.communicationPolicy.findFirst({ where: { orgId: null, status: normalized as JobStatus } }))
    );
  } catch {
    // If the table isn't migrated yet, silently fall back.
    return null;
  }
}

function isOutboundMessageType(value: string): value is OutboundMessageType {
  return (Object.values(OutboundMessageType) as string[]).includes(value);
}

function defaultTemplateKeyForStatus(status: JobStatus): OutboundMessageType {
  // READY_FOR_PICKUP nudges are scheduled separately; the status-change notice should be a single message.
  if (status === JobStatus.READY_FOR_PICKUP) return OutboundMessageType.JOB_STATUS_UPDATE;
  if (status === JobStatus.COMPLETED) return OutboundMessageType.JOB_COMPLETED;
  return OutboundMessageType.JOB_STATUS_UPDATE;
}

function nudge2KeyFrom(nudge1Key: string): string {
  if (nudge1Key.endsWith("_NUDGE_1")) return nudge1Key.replace(/_NUDGE_1$/, "_NUDGE_2");
  return nudge1Key;
}

async function sendClientWhatsAppForStatusChange(input: {
  orgId: string;
  jobId: string;
  jobNumber: string;
  oldStatus: JobStatus;
  newStatus: JobStatus;
  templateKey: string | null;
}) {
  const client = await prisma.client
    .findFirst({
      where: { orgId: input.orgId, jobs: { some: { id: input.jobId } } },
      select: { phone: true, fullName: true },
    })
    .catch(() => null);

  if (!client?.phone) return;

  const templateKey = input.templateKey ?? defaultTemplateKeyForStatus(input.newStatus);
  const type: OutboundMessageType = isOutboundMessageType(templateKey)
    ? (templateKey as OutboundMessageType)
    : OutboundMessageType.JOB_STATUS_UPDATE;

  const fallback = `Hi ${client.fullName}, update on job ${input.jobNumber}: status is now ${input.newStatus.replaceAll("_", " ")}. - Your Repair Team`;

  const templateVars = {
    customerName: client.fullName,
    jobNumber: input.jobNumber,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    oldStatusLabel: input.oldStatus.replaceAll("_", " "),
    newStatusLabel: input.newStatus.replaceAll("_", " "),
  };

  const rendered = await renderCommunicationTemplate({
    orgId: input.orgId,
    key: templateKey,
    channel: "WHATSAPP",
    variables: templateVars,
    fallback: { body: fallback },
  });

  const enqueueResult = await enqueueWhatsAppMessage({
    orgId: input.orgId,
    to: client.phone,
    body: rendered.body,
    type,
    jobId: input.jobId,
    provider: "meta",
    templateKey,
    templateVars: JSON.stringify(templateVars),
    metaTemplateName: rendered.metaTemplateName,
    metaTemplateLanguage: rendered.metaLanguageCode,
    metaTemplateVars: rendered.metaParamValues.length > 0 ? JSON.stringify(rendered.metaParamValues) : null,
  }).catch(() => null);

  if (enqueueResult && "outboxId" in enqueueResult && enqueueResult.outboxId) {
    await deliverOutboundMessage(enqueueResult.outboxId).catch(() => null);
  }
}

async function cancelReadyForPickupNudges(jobId: string, scope: "WHATSAPP" | "EMAIL" | "BOTH") {
  try {
    await prisma.outboundMessage.updateMany({
      where: {
        jobId,
        channel: scope === "BOTH" ? { in: ["WHATSAPP", "EMAIL"] } : scope,
        status: { in: ["PENDING", "FAILED"] },
        type: { in: [OutboundMessageType.READY_FOR_PICKUP_NUDGE_1, OutboundMessageType.READY_FOR_PICKUP_NUDGE_2] },
      },
      data: {
        status: "DEAD",
        nextAttemptAt: new Date(0),
        lockedAt: null,
      },
    });
  } catch {
    // Ignore: table may not exist yet.
  }
}

async function scheduleReadyForPickupNudges(input: {
  orgId: string;
  jobId: string;
  jobNumber: string;
  nudge1Hours: number | null;
  nudge2Hours: number | null;
  templateKey: string | null;
}) {
  const n1 = typeof input.nudge1Hours === "number" && input.nudge1Hours > 0 ? input.nudge1Hours : null;
  const n2 = typeof input.nudge2Hours === "number" && input.nudge2Hours > 0 ? input.nudge2Hours : null;
  if (!n1 && !n2) return;

  const client = await prisma.client
    .findFirst({
      where: { orgId: input.orgId, jobs: { some: { id: input.jobId } } },
      select: { phone: true, fullName: true },
    })
    .catch(() => null);

  if (!client?.phone) return;

  // De-dupe: remove any existing pending/failed nudges for this job.
  await cancelReadyForPickupNudges(input.jobId, "WHATSAPP");

  // Nudges always use the dedicated nudge templates.
  const key1 = input.templateKey ? input.templateKey : OutboundMessageType.READY_FOR_PICKUP_NUDGE_1;
  const key2 = input.templateKey ? nudge2KeyFrom(input.templateKey) : OutboundMessageType.READY_FOR_PICKUP_NUDGE_2;

  const nudgeVars = { customerName: client.fullName, jobNumber: input.jobNumber };

  const makeRendered = async (key: string) => {
    const fallback = `Hi ${client.fullName}, your device for job ${input.jobNumber} is ready for pickup. Please visit us to collect it. - Your Repair Team`;
    return renderCommunicationTemplate({
      orgId: input.orgId,
      key,
      channel: "WHATSAPP",
      variables: nudgeVars,
      fallback: { body: fallback },
    });
  };

  if (n1) {
    const rendered = await makeRendered(key1);
    await enqueueWhatsAppMessage({
      orgId: input.orgId,
      to: client.phone,
      body: rendered.body,
      type: OutboundMessageType.READY_FOR_PICKUP_NUDGE_1,
      jobId: input.jobId,
      provider: "meta",
      nextAttemptAt: new Date(Date.now() + n1 * 60 * 60 * 1000),
      templateKey: key1,
      templateVars: JSON.stringify(nudgeVars),
      metaTemplateName: rendered.metaTemplateName,
      metaTemplateLanguage: rendered.metaLanguageCode,
      metaTemplateVars: rendered.metaParamValues.length > 0 ? JSON.stringify(rendered.metaParamValues) : null,
    }).catch(() => null);
  }

  if (n2) {
    const rendered = await makeRendered(key2);
    await enqueueWhatsAppMessage({
      orgId: input.orgId,
      to: client.phone,
      body: rendered.body,
      type: OutboundMessageType.READY_FOR_PICKUP_NUDGE_2,
      jobId: input.jobId,
      provider: "meta",
      nextAttemptAt: new Date(Date.now() + n2 * 60 * 60 * 1000),
      templateKey: key2,
      templateVars: JSON.stringify(nudgeVars),
      metaTemplateName: rendered.metaTemplateName,
      metaTemplateLanguage: rendered.metaLanguageCode,
      metaTemplateVars: rendered.metaParamValues.length > 0 ? JSON.stringify(rendered.metaParamValues) : null,
    }).catch(() => null);
  }
}

async function sendClientEmailForStatusChange(input: {
  orgId: string;
  jobId: string;
  jobNumber: string;
  oldStatus: JobStatus;
  newStatus: JobStatus;
  templateKey: string | null;
}) {
  const client = await prisma.client
    .findFirst({
      where: { orgId: input.orgId, jobs: { some: { id: input.jobId } } },
      select: { email: true, fullName: true },
    })
    .catch(() => null);

  if (!client?.email) return;

  const templateKey = input.templateKey ?? defaultTemplateKeyForStatus(input.newStatus);
  const type: OutboundMessageType = isOutboundMessageType(templateKey)
    ? (templateKey as OutboundMessageType)
    : OutboundMessageType.JOB_STATUS_UPDATE;

  const vars = {
    customerName: client.fullName,
    jobNumber: input.jobNumber,
    oldStatus: input.oldStatus,
    newStatus: input.newStatus,
    oldStatusLabel: input.oldStatus.replaceAll("_", " "),
    newStatusLabel: input.newStatus.replaceAll("_", " "),
  };

  const fallbackSubject = `Update on Job #${input.jobNumber}`;
  const fallbackBody = `Hello ${client.fullName},\n\nUpdate on Job #${input.jobNumber}: status is now ${vars.newStatusLabel}.\n\nYour Repair Team`;

  const rendered = await renderCommunicationTemplate({
    orgId: input.orgId,
    key: templateKey,
    channel: "EMAIL",
    variables: vars,
    fallback: { subject: fallbackSubject, body: fallbackBody },
  });

  const enqueueResult = await enqueueEmailMessage({
    orgId: input.orgId,
    to: client.email,
    subject: rendered.subject ?? fallbackSubject,
    body: rendered.body,
    type,
    jobId: input.jobId,
    templateKey,
    templateVars: JSON.stringify(vars),
  }).catch(() => null);

  if (enqueueResult && "outboxId" in enqueueResult && enqueueResult.outboxId) {
    await deliverOutboundMessage(enqueueResult.outboxId).catch(() => null);
  }
}

async function scheduleReadyForPickupEmailNudges(input: {
  orgId: string;
  jobId: string;
  jobNumber: string;
  nudge1Hours: number | null;
  nudge2Hours: number | null;
  templateKey: string | null;
}) {
  const n1 = typeof input.nudge1Hours === "number" && input.nudge1Hours > 0 ? input.nudge1Hours : null;
  const n2 = typeof input.nudge2Hours === "number" && input.nudge2Hours > 0 ? input.nudge2Hours : null;
  if (!n1 && !n2) return;

  const client = await prisma.client
    .findFirst({
      where: { orgId: input.orgId, jobs: { some: { id: input.jobId } } },
      select: { email: true, fullName: true },
    })
    .catch(() => null);

  if (!client?.email) return;

  // De-dupe: remove any existing pending/failed nudges for this job.
  await cancelReadyForPickupNudges(input.jobId, "EMAIL");

  const baseKey = input.templateKey ?? OutboundMessageType.READY_FOR_PICKUP_NUDGE_1;
  const key1 = baseKey;
  const key2 = input.templateKey ? nudge2KeyFrom(baseKey) : OutboundMessageType.READY_FOR_PICKUP_NUDGE_2;

  const makeEmail = async (key: string) => {
    const fallbackSubject = `Pickup Reminder: Job #${input.jobNumber}`;
    const fallbackBody = `Hello ${client.fullName},\n\nReminder: your device for job ${input.jobNumber} is ready for pickup.\n\nYour Repair Team`;
    const rendered = await renderCommunicationTemplate({
      orgId: input.orgId,
      key,
      channel: "EMAIL",
      variables: { customerName: client.fullName, jobNumber: input.jobNumber },
      fallback: { subject: fallbackSubject, body: fallbackBody },
    });
    return { subject: rendered.subject ?? fallbackSubject, body: rendered.body };
  };

  if (n1) {
    const msg = await makeEmail(key1);
    await enqueueEmailMessage({
      orgId: input.orgId,
      to: client.email,
      subject: msg.subject,
      body: msg.body,
      type: OutboundMessageType.READY_FOR_PICKUP_NUDGE_1,
      jobId: input.jobId,
      nextAttemptAt: new Date(Date.now() + n1 * 60 * 60 * 1000),
      templateKey: key1,
      templateVars: JSON.stringify({ customerName: client.fullName, jobNumber: input.jobNumber }),
    }).catch(() => null);
  }

  if (n2) {
    const msg = await makeEmail(key2);
    await enqueueEmailMessage({
      orgId: input.orgId,
      to: client.email,
      subject: msg.subject,
      body: msg.body,
      type: OutboundMessageType.READY_FOR_PICKUP_NUDGE_2,
      jobId: input.jobId,
      nextAttemptAt: new Date(Date.now() + n2 * 60 * 60 * 1000),
      templateKey: key2,
      templateVars: JSON.stringify({ customerName: client.fullName, jobNumber: input.jobNumber }),
    }).catch(() => null);
  }
}

export async function notifyApprovalNeeded(
  orgId: string,
  jobId: string,
  jobNumber: string,
  clientName: string,
  costEstimate: number
) {
  const prefs = await getUserPreferencesForRoles(orgId, ["ADMIN", "OPS"]);
  const targetRoles = prefs.filter((p) => p.notifyApprovalNeeded).map((p) => p.userId);
  const title = "Approval Needed";
  const message = `Job ${jobNumber} (${clientName}) requires approval. Estimated cost: ${formatMoney(costEstimate)}`;

  if (targetRoles.length > 0) {
    await prisma.notification.createMany({
      data: targetRoles.map((userId) => ({
        type: NotificationType.APPROVAL_NEEDED,
        title,
        message,
        jobId,
        userId,
        channel: NotificationChannel.DASHBOARD,
        orgId,
      })),
    });
  }

  const client = await prisma.client.findFirst({
    where: { orgId, jobs: { some: { id: jobId } } },
    select: { phone: true, fullName: true },
  });

  if (client?.phone && prefs.some((p) => p.whatsappEnabled)) {
    await sendCustomWhatsAppMessage(
      client.phone,
      `Hi ${client.fullName}, your repair for job ${jobNumber} is ready. Estimated cost: ${formatMoney(costEstimate)}. Please confirm to proceed. - Your Repair Team`
    );
  }
}

async function getUserPreferencesForRoles(
  orgId: string,
  roles: Array<"ADMIN" | "OPS" | "TECHNICIAN_INTERNAL" | "TECHNICIAN_EXTERNAL" | "FRONT_DESK">,
) {
  const users = await prisma.user.findMany({
    where: { orgId, role: { in: roles }, isActive: true },
    select: { id: true },
  });
  if (users.length === 0) {
    return [] as Array<{
      userId: string;
      whatsappEnabled: boolean;
      notifyStatusChange: boolean;
      notifyApprovalNeeded: boolean;
      notifyEstimateSubmitted: boolean;
      notifyTimelineUpdated: boolean;
      notifyDelayNote: boolean;
    }>;
  }

  const prefs = await prisma.notificationPreferences.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: {
      userId: true,
      whatsappEnabled: true,
      notifyStatusChange: true,
      notifyApprovalNeeded: true,
      notifyEstimateSubmitted: true,
      notifyTimelineUpdated: true,
      notifyDelayNote: true,
    },
  });

  const prefMap = new Map(prefs.map((p) => [p.userId, p]));
  return users.map((u) =>
    prefMap.get(u.id) ?? {
      userId: u.id,
      whatsappEnabled: true,
      notifyStatusChange: true,
      notifyApprovalNeeded: true,
      notifyEstimateSubmitted: true,
      notifyTimelineUpdated: true,
      notifyDelayNote: true,
    },
  );
}

export async function notifyJobAssigned(
  orgId: string,
  jobId: string,
  jobNumber: string,
  deviceInfo: string,
  technicianId: string
) {
  const title = "Job Assigned";
  const message = `You've been assigned job ${jobNumber} - ${deviceInfo}`;

  await createNotification({
    orgId,
    type: NotificationType.JOB_ASSIGNED,
    title,
    message,
    jobId,
    userId: technicianId,
  });
}

export async function notifyEstimateSubmitted(
  orgId: string,
  jobId: string,
  jobNumber: string,
  deviceInfo: string,
  estimatedCost: number
) {
  const prefs = await getUserPreferencesForRoles(orgId, ["ADMIN", "OPS"]);
  const targets = prefs.filter((p) => p.notifyEstimateSubmitted).map((p) => p.userId);
  const title = "Estimate Submitted";
  const message = `External tech submitted estimate for job ${jobNumber} (${deviceInfo}) - ${formatMoney(estimatedCost)}`;

  if (targets.length > 0) {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        type: NotificationType.ESTIMATE_SUBMITTED,
        title,
        message,
        jobId,
        userId,
        channel: NotificationChannel.DASHBOARD,
        orgId,
      })),
    });
  }
}

export async function notifyTimelineUpdate(
  orgId: string,
  jobId: string,
  jobNumber: string,
  deviceInfo: string,
  newTimeline: string
) {
  const prefs = await getUserPreferencesForRoles(orgId, ["ADMIN", "OPS"]);
  const targets = prefs.filter((p) => p.notifyTimelineUpdated).map((p) => p.userId);
  const title = "Timeline Updated";
  const message = `Job ${jobNumber} (${deviceInfo}) timeline updated: ${newTimeline}`;

  if (targets.length > 0) {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        type: NotificationType.TIMELINE_UPDATED,
        title,
        message,
        jobId,
        userId,
        channel: NotificationChannel.DASHBOARD,
        orgId,
      })),
    });
  }
}

export async function notifyDelayNote(
  orgId: string,
  jobId: string,
  jobNumber: string,
  deviceInfo: string,
  note: string
) {
  const prefs = await getUserPreferencesForRoles(orgId, ["ADMIN", "OPS"]);
  const targets = prefs.filter((p) => p.notifyDelayNote).map((p) => p.userId);
  const title = "Delay Note Added";
  const message = `Job ${jobNumber} (${deviceInfo}) delay: ${note}`;

  if (targets.length > 0) {
    await prisma.notification.createMany({
      data: targets.map((userId) => ({
        type: NotificationType.DELAY_NOTE_ADDED,
        title,
        message,
        jobId,
        userId,
        channel: NotificationChannel.DASHBOARD,
        orgId,
      })),
    });
  }
}
