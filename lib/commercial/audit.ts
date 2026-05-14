import { prisma } from "@/lib/prisma";

type AuditInput = {
  orgId?: string | null;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function writeSystemAuditEvent(input: AuditInput) {
  return prisma.systemAuditEvent
    .create({
      data: {
        orgId: input.orgId ?? null,
        actorUserId: input.actorUserId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        summary: input.summary ?? null,
        beforeJson: safeJson(input.before),
        afterJson: safeJson(input.after),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
    .catch(() => null);
}
