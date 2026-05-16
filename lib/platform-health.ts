import { getAuditRetentionDays } from "@/lib/commercial/audit-retention";
import { prisma } from "@/lib/prisma";

export const PLATFORM_CRON_ENDPOINTS = [
  { name: "WhatsApp retry", path: "/api/cron/whatsapp-retry", schedule: "0 7 * * *", label: "Daily 07:00" },
  { name: "Data heal", path: "/api/cron/data-heal", schedule: "30 2 * * *", label: "Daily 02:30" },
  { name: "Audit prune", path: "/api/cron/audit-prune", schedule: "0 3 * * 0", label: "Weekly Sunday 03:00" },
] as const;

export async function platformTableExists(name: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${name}
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getLastAuditPruneEvent() {
  if (!(await platformTableExists("SystemAuditEvent"))) return null;
  return prisma.systemAuditEvent.findFirst({
    where: { action: { in: ["CRON_AUDIT_EVENTS_PRUNED", "PLATFORM_AUDIT_EVENTS_PRUNED"] } },
    orderBy: { createdAt: "desc" },
    select: { action: true, summary: true, afterJson: true, createdAt: true },
  }).catch(() => null);
}

export async function getPlatformHealthSummary() {
  const [auditRetentionDays, lastAuditPrune, commercialTables] = await Promise.all([
    getAuditRetentionDays(),
    getLastAuditPruneEvent(),
    Promise.all([
      platformTableExists("SystemAuditEvent"),
      platformTableExists("OrgFeatureEntitlement"),
      platformTableExists("OrgUsageSnapshot"),
      platformTableExists("Conversation"),
      platformTableExists("InvoiceLine"),
    ]),
  ]);

  const cronSecretReady = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32);
  const commercialTablesReady = commercialTables.every(Boolean);

  return {
    cronSecretReady,
    commercialTablesReady,
    auditRetentionDays,
    lastAuditPrune,
    cronEndpoints: PLATFORM_CRON_ENDPOINTS,
  };
}

export async function getPlatformHealthChecks() {
  const checks: Record<string, { ok: boolean; detail?: unknown }> = {};
  const run = async (name: string, fn: () => Promise<{ ok?: boolean; detail?: unknown }>) => {
    try {
      const result = await fn();
      checks[name] = { ok: result.ok ?? true, detail: result.detail };
    } catch (error) {
      checks[name] = { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  };

  const summary = await getPlatformHealthSummary();

  await run("database", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    const connected = rows[0]?.ok === 1;
    return { ok: connected, detail: { connected } };
  });

  await run("commercialTables", async () => {
    const detail = {
      systemAuditEvent: await platformTableExists("SystemAuditEvent"),
      orgFeatureEntitlement: await platformTableExists("OrgFeatureEntitlement"),
      orgUsageSnapshot: await platformTableExists("OrgUsageSnapshot"),
      conversation: await platformTableExists("Conversation"),
      invoiceLine: await platformTableExists("InvoiceLine"),
    };
    return { ok: Object.values(detail).every(Boolean), detail };
  });

  await run("auditRetention", async () => ({
    detail: {
      retentionDays: summary.auditRetentionDays,
      lastPruneAt: summary.lastAuditPrune?.createdAt.toISOString() ?? null,
      lastPruneAction: summary.lastAuditPrune?.action ?? null,
      lastPruneResult: summary.lastAuditPrune?.afterJson ?? null,
    },
  }));

  await run("cron", async () => ({
    ok: summary.cronSecretReady,
    detail: {
      cronSecretConfigured: summary.cronSecretReady,
      endpoints: summary.cronEndpoints.map(({ path, schedule }) => ({ path, schedule })),
    },
  }));

  return checks;
}
