import { prisma } from "@/lib/prisma";

export async function recordOrgSubscriptionEvent({
  orgId,
  provider,
  eventType,
  providerEventId,
  plan,
  status,
  amount,
  currency,
  payload,
}: {
  orgId: string;
  provider: string;
  eventType: string;
  providerEventId?: string | null;
  plan?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  payload?: unknown;
}) {
  try {
    await prisma.orgSubscriptionEvent.create({
      data: {
        orgId,
        provider,
        eventType,
        providerEventId: providerEventId ?? null,
        plan: plan ?? null,
        status: status ?? null,
        amount: amount ?? null,
        currency: currency ?? null,
        payloadJson: payload === undefined ? null : JSON.stringify(payload),
      },
    });
  } catch {
    // Subscription events are additive; never block billing callbacks/webhooks.
  }
}

export async function getOrgSecurityPolicy(orgId: string) {
  try {
    return await prisma.orgSecurityPolicy.upsert({
      where: { orgId },
      create: { orgId },
      update: {},
    });
  } catch {
    return null;
  }
}

export async function getOrgUsageSnapshots(orgId: string, limit = 40) {
  try {
    return await prisma.orgUsageSnapshot.findMany({
      where: { orgId },
      orderBy: [{ capturedAt: "desc" }],
      take: limit,
    });
  } catch {
    return [];
  }
}

export async function getOrgSubscriptionEvents(orgId: string, limit = 30) {
  try {
    return await prisma.orgSubscriptionEvent.findMany({
      where: { orgId },
      orderBy: [{ occurredAt: "desc" }],
      take: limit,
    });
  } catch {
    return [];
  }
}

export async function getOrgFeatureEntitlementRows(orgId: string) {
  try {
    return await prisma.orgFeatureEntitlement.findMany({
      where: { orgId },
      orderBy: [{ feature: "asc" }],
    });
  } catch {
    return [];
  }
}
