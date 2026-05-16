import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TABLES_TO_CHECK = [
  "User",
  "Session",
  "Account",
  "Verification",
  "UserPermission",
  "Client",
  "Device",
  "Job",
  "Photo",
  "AuditLog",
  "RepairRequest",
  "OutboundMessage",
  "Notification",
  "NotificationPreferences",
  "DocumentBrandingSettings",
] as const;

  const JOB_COLUMNS_TO_CHECK = [
  "status",
  "deviceType",
  "brand",
  "model",
  "serialOrImei",
  "accessories",
  "physicalNotes",
  "clientApproved",
  "approvalDate",
  "quotedAt",
  "repairTimeline",
  "clientPaid",
  "clientPaidAt",
  "clientPaidById",
  "clientPaymentRef",
  "invoiceNumber",
  "invoiceIssuedAt",
  "deviceId",
  "serviceType",
  "softwareOsInstall",
  "softwareDriversUpdates",
  "softwareDataBackupRestore",
  "softwareAccountSetup",
  "softwarePerformanceTune",
  "softwareThirdPartyApps",
  "softwareRequestedNotes",
  "softwareLicenseAttested",
  "softwareInstallerSource",
  "softwareInstallerSourceNote",
  "deliveredAt",
  "deliveryMethod",
  "deliveredTo",
  "externalTechFee",
  "externalPaid",
  "externalPaidAt",
    "vatApplicable",
  ] as const;

const OUTBOX_COLUMNS_TO_CHECK = [
  "providerDeliveryStatus",
  "providerDeliveryAt",
  "providerDeliveryErrorCode",
  "providerDeliveryError",
] as const;

type SqliteTableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

export async function GET() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1) Tables
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `;
  const tableSet = new Set(tables.map((t) => t.name));
  const tablesPresent = Object.fromEntries(TABLES_TO_CHECK.map((t) => [t, tableSet.has(t)]));

  // 2) Job columns
  let jobColumnsPresent: Record<string, boolean> | null = null;
  let jobColumnNames: string[] | null = null;
  try {
    const info = await prisma.$queryRaw<SqliteTableInfoRow[]>`PRAGMA table_info('Job')`;
    jobColumnNames = info.map((row) => row.name);
    const colSet = new Set(jobColumnNames);
    jobColumnsPresent = Object.fromEntries(JOB_COLUMNS_TO_CHECK.map((c) => [c, colSet.has(c)]));
  } catch {
    jobColumnsPresent = null;
    jobColumnNames = null;
  }

  // 3) Actual status values in DB (raw, to avoid enum parsing)
  let jobStatusCounts: Array<{ status: string; count: number }> | null = null;
  try {
    const rows = await prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT status as status, COUNT(*) as count FROM "Job" GROUP BY status ORDER BY count DESC
    `;
    jobStatusCounts = rows;
  } catch {
    jobStatusCounts = null;
  }

  // 4) Outbox columns
  let outboxColumnsPresent: Record<string, boolean> | null = null;
  try {
    const info = await prisma.$queryRaw<SqliteTableInfoRow[]>`PRAGMA table_info('OutboundMessage')`;
    const colSet = new Set(info.map((row) => row.name));
    outboxColumnsPresent = Object.fromEntries(OUTBOX_COLUMNS_TO_CHECK.map((c) => [c, colSet.has(c)]));
  } catch {
    outboxColumnsPresent = null;
  }

  return NextResponse.json({
    ok: true,
    tablesPresent,
    jobColumnsPresent,
    jobColumnNames,
    jobStatusCounts,
    outboxColumnsPresent,
  });
}
