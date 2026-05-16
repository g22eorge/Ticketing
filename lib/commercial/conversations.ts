import { prisma } from "@/lib/prisma";

async function resolveClientId({ orgId, jobId }: { orgId: string; jobId?: string | null }) {
  if (!jobId) return null;
  const job = await prisma.job.findFirst({
    where: { id: jobId, orgId },
    select: { clientId: true },
  });
  return job?.clientId ?? null;
}

async function findOrCreateConversation({
  orgId,
  channel,
  clientId,
  jobId,
  repairRequestId,
  subject,
}: {
  orgId: string;
  channel: string;
  clientId?: string | null;
  jobId?: string | null;
  repairRequestId?: string | null;
  subject?: string | null;
}) {
  const where = jobId
    ? { orgId, channel, jobId }
    : repairRequestId
      ? { orgId, channel, repairRequestId }
      : clientId
        ? { orgId, channel, clientId }
        : null;

  if (!where) return null;

  const existing = await prisma.conversation.findFirst({
    where: { ...where, status: "OPEN" },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      orgId,
      channel,
      clientId: clientId ?? null,
      jobId: jobId ?? null,
      repairRequestId: repairRequestId ?? null,
      subject: subject ?? null,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
}

export async function recordOutboundConversationMessage({
  orgId,
  channel,
  recipient,
  body,
  outboundMessageId,
  providerMessageId,
  jobId,
  repairRequestId,
  subject,
  sentAt,
}: {
  orgId?: string | null;
  channel: string;
  recipient: string;
  body: string;
  outboundMessageId?: string | null;
  providerMessageId?: string | null;
  jobId?: string | null;
  repairRequestId?: string | null;
  subject?: string | null;
  sentAt?: Date | null;
}) {
  if (!orgId) return;

  try {
    const clientId = await resolveClientId({ orgId, jobId });
    const conversation = await findOrCreateConversation({ orgId, channel, clientId, jobId, repairRequestId, subject });
    if (!conversation) return;

    await prisma.conversationMessage.create({
      data: {
        orgId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        channel,
        recipient,
        body,
        outboundMessageId: outboundMessageId ?? null,
        providerMessageId: providerMessageId ?? null,
        sentAt: sentAt ?? null,
      },
    });

    await prisma.conversation.updateMany({
      where: { id: conversation.id, orgId },
      data: { lastMessageAt: sentAt ?? new Date() },
    });
  } catch {
    // Conversation records are additive; never block notification delivery.
  }
}

export async function markOutboundConversationMessageSent({
  orgId,
  outboundMessageId,
  providerMessageId,
  sentAt,
}: {
  orgId?: string | null;
  outboundMessageId: string;
  providerMessageId?: string | null;
  sentAt: Date;
}) {
  if (!orgId) return;
  try {
    await prisma.conversationMessage.updateMany({
      where: { orgId, outboundMessageId },
      data: { providerMessageId: providerMessageId ?? null, sentAt },
    });
  } catch {
    // Optional conversation mirror only.
  }
}

export async function recordInboundConversationMessage({
  orgId,
  sender,
  body,
  inboundMessageId,
  providerMessageId,
  jobId,
  clientId,
  receivedAt,
}: {
  orgId?: string | null;
  sender: string;
  body?: string | null;
  inboundMessageId?: string | null;
  providerMessageId?: string | null;
  jobId?: string | null;
  clientId?: string | null;
  receivedAt: Date;
}) {
  if (!orgId) return;
  try {
    const conversation = await findOrCreateConversation({
      orgId,
      channel: "WHATSAPP",
      clientId,
      jobId,
      subject: jobId ? "Job conversation" : "Customer conversation",
    });
    if (!conversation) return;

    await prisma.conversationMessage.create({
      data: {
        orgId,
        conversationId: conversation.id,
        direction: "INBOUND",
        channel: "WHATSAPP",
        sender,
        body,
        inboundMessageId: inboundMessageId ?? null,
        providerMessageId: providerMessageId ?? null,
        receivedAt,
      },
    });

    await prisma.conversation.updateMany({
      where: { id: conversation.id, orgId },
      data: { lastMessageAt: receivedAt },
    });
  } catch {
    // Optional conversation mirror only.
  }
}

export async function writeCommunicationTemplateVersion({
  orgId,
  templateId,
  subject,
  body,
  variables,
  createdById,
  status = "ACTIVE",
}: {
  orgId?: string | null;
  templateId: string;
  subject?: string | null;
  body: string;
  variables?: string | null;
  createdById?: string | null;
  status?: string;
}) {
  try {
    const latest = await prisma.communicationTemplateVersion.findFirst({
      where: { templateId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    await prisma.communicationTemplateVersion.create({
      data: {
        orgId: orgId ?? null,
        templateId,
        version: (latest?.version ?? 0) + 1,
        status,
        subject: subject ?? null,
        body,
        variables: variables ?? null,
        approvedAt: status === "ACTIVE" ? new Date() : null,
        createdById: createdById ?? null,
      },
    });
  } catch {
    // Template versioning is additive and must not block template edits.
  }
}
