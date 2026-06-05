import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { whatsappConfigSummary } from "@/lib/notifications/whatsapp";
import { emailIsConfigured } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: Record<string, unknown> = {
    ok: true,
    checks: {},
  };

  const run = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      const value = await fn();
      (results.checks as Record<string, unknown>)[name] = { ok: true, value };
    } catch (e) {
      results.ok = false;
      (results.checks as Record<string, unknown>)[name] = { ok: false, error: serializeError(e) };
    }
  };

  // Baseline connectivity
  await run("db:tables", async () =>
    prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );

  // Core reads used by dashboard/jobs
  await run("job:count", async () => prisma.job.count());
  await run("job:groupByStatus", async () =>
    prisma.job.groupBy({ by: ["status"], _count: { status: true } }),
  );
  await run("job:groupByDeviceType", async () =>
    prisma.job.groupBy({ by: ["deviceType"], _count: { deviceType: true } }),
  );
  await run("job:recent", async () =>
    prisma.job.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, jobNumber: true, status: true, updatedAt: true },
    }),
  );

  // Dashboard-specific query patterns that can break on libsql adapters
  await run("dashboard:externalCompletedRelationFilter", async () =>
    prisma.job.findMany({
      take: 3,
      where: {
        status: "COMPLETED",
        repairPath: "EXTERNAL",
        assignedTo: { is: { role: "TECHNICIAN_EXTERNAL" } },
      },
      select: { id: true, jobNumber: true },
    }),
  );

  await run("dashboard:assignedToInclude", async () =>
    prisma.job.findMany({
      take: 3,
      where: { assignedToId: { not: null } },
      include: { assignedTo: true },
    }),
  );

  // Jobs list query pattern: relation filters (client name/phone search)
  await run("jobs:clientRelationFilterSearch", async () =>
    prisma.job.findMany({
      take: 3,
      where: {
        OR: [
          { jobNumber: { contains: "EIS" } },
          { client: { fullName: { contains: "a" } } },
          { client: { phone: { contains: "7" } } },
        ],
      },
      include: { client: true, assignedTo: true },
    }),
  );

  // Concurrency probe: dashboard runs large Promise.all batches.
  await run("dashboard:adminLargePromiseAll", async () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 31);
    const end = now;

    const [
      statusGroup,
      deviceGroup,
      completedSelected,
      receivedSelectedCount,
      closedSelectedCount,
      externalCount,
      inHouseCount,
      externalCompleted,
    ] = await Promise.all([
      prisma.job.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.job.groupBy({ by: ["deviceType"], _count: { deviceType: true } }),
      prisma.job.findMany({ where: { status: "COMPLETED", completedAt: { gte: start, lte: end } }, take: 500 }),
      prisma.job.count({ where: { receivedAt: { gte: start, lte: end } } }),
      prisma.job.count({ where: { status: "CLOSED", closedAt: { gte: start, lte: end } } }),
      prisma.job.count({ where: { repairPath: "EXTERNAL", receivedAt: { gte: start, lte: end } } }),
      prisma.job.count({ where: { repairPath: "IN_HOUSE", receivedAt: { gte: start, lte: end } } }),
      prisma.job.findMany({
        where: { repairPath: "EXTERNAL", status: "COMPLETED" },
        select: { id: true, externalTechBill: true },
        take: 1000,
      }),
    ]);

    return {
      statusBuckets: statusGroup.length,
      deviceBuckets: deviceGroup.length,
      completedSelected: completedSelected.length,
      receivedSelectedCount,
      closedSelectedCount,
      externalCount,
      inHouseCount,
      externalCompleted: externalCompleted.length,
    };
  });

  // Notifications (these were missing in prod)
  await run("notification:count", async () => prisma.notification.count());
  await run("notificationPreferences:count", async () => prisma.notificationPreferences.count());

  // WhatsApp config (avoid network calls in probe)
  await run("whatsapp:configured", async () => whatsappConfigSummary());

  // Email config
  await run("email:configured", async () => ({ configured: emailIsConfigured() }));

  // Outbox
  await run("outbox:count", async () => prisma.outboundMessage.count());
  await run("outbox:byChannel", async () =>
    prisma.outboundMessage.groupBy({ by: ["channel"], _count: { channel: true } }),
  );
  await run("outbox:pending", async () =>
    prisma.outboundMessage.findMany({
      take: 5,
      where: { status: { in: ["PENDING", "FAILED"] } },
      orderBy: { nextAttemptAt: "asc" },
      select: {
        id: true,
        channel: true,
        type: true,
        status: true,
        to: true,
        attemptCount: true,
        lastErrorCode: true,
        lastError: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
      },
    }),
  );

  // Repair requests (website intake)
  await run("repairRequest:count", async () => prisma.repairRequest.count());
  await run("repairRequest:recent", async () =>
    prisma.repairRequest.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requestNumber: true,
        requestStatus: true,
        phone: true,
        deviceType: true,
        brand: true,
        createdAt: true,
      },
    }),
  );

  // Branding (can crash if table columns drifted)
  await run("branding:delegateRead", async () => {
    const delegate = (prisma as unknown as {
      documentBrandingSettings?: {
        findUnique: (args: { where: { id: string } }) => Promise<unknown>;
      };
    }).documentBrandingSettings;
    if (!delegate) return { delegate: false };
    const row = await delegate.findUnique({ where: { id: "singleton" } });
    return { delegate: true, hasRow: Boolean(row) };
  });

  await run("branding:pragmaColumns", async () =>
    prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info('DocumentBrandingSettings')`,
  );

  // Session user lookup path
  await run("user:current", async () =>
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, isActive: true } }),
  );
  await run("userPermission:sample", async () =>
    prisma.userPermission.findMany({ take: 5, select: { userId: true, permission: true } }),
  );

  return NextResponse.json(results);
}
