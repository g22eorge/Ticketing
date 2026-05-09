import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  // Provide a safe in-browser runner (uses current session cookies).
  // Actual mutation stays on POST.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DB Fix</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h1 style="margin: 0 0 8px;">MRMS DB Fix</h1>
    <p style="margin: 0 0 16px;">Runs a one-time schema repair (delivery + notifications + branding + devices). Admin only.</p>
    <button id="run" style="padding: 10px 14px; border: 1px solid #000; background: #000; color: #fff; border-radius: 8px; cursor: pointer;">Run Fix</button>
    <pre id="out" style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; white-space: pre-wrap;"></pre>
    <script>
      const out = document.getElementById('out');
      const btn = document.getElementById('run');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = 'Running...';
        try {
          const res = await fetch(location.href, { method: 'POST', credentials: 'include' });
          const text = await res.text();
          out.textContent = text;
        } catch (e) {
          out.textContent = String(e);
        } finally {
          btn.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function tableExists(name: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${name}
  `;
  return rows.length > 0;
}

async function jobColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('Job')
  `;
  return new Set(rows.map((r) => r.name));
}

async function brandingColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('DocumentBrandingSettings')
  `;
  return new Set(rows.map((r) => r.name));
}

async function userColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('User')
  `;
  return new Set(rows.map((r) => r.name));
}

export async function POST() {
  const { user } = await getCurrentUserRole();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const changes: Array<{ kind: string; detail: string }> = [];

  // Devices
  const hasDevice = await tableExists("Device");
  if (!hasDevice) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Device" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "clientId" TEXT NOT NULL,
        "deviceType" TEXT NOT NULL,
        "brand" TEXT NOT NULL,
        "model" TEXT NOT NULL,
        "serialOrImei" TEXT,
        "accessories" TEXT,
        "physicalNotes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Device_clientId_idx" ON "Device"("clientId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Device_serialOrImei_idx" ON "Device"("serialOrImei")');
    changes.push({ kind: "create_table", detail: "Created Device + indexes" });
  }

  // Repair request numbering sequence (concurrency-safe requestNumber allocation)
  const hasRepairRequestSequence = await tableExists("RepairRequestSequence");
  if (!hasRepairRequestSequence) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RepairRequestSequence" (
        "year" INTEGER NOT NULL PRIMARY KEY,
        "value" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    changes.push({ kind: "create_table", detail: "Created RepairRequestSequence" });
  }

  // Job columns
  const cols = await jobColumns();
  const addJobColumn = async (name: string, type: string, dflt?: string) => {
    if (cols.has(name)) return;
    const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
    await prisma.$executeRawUnsafe(`ALTER TABLE "Job" ADD COLUMN "${name}" ${type}${defaultClause}`);
    changes.push({ kind: "alter_table", detail: `Added Job.${name}` });
  };

  // Legacy schema compatibility: some older SQLite/Turso snapshots are missing
  // these fields that are now required by Prisma queries.
  await addJobColumn("deviceType", "TEXT", "'OTHER'");
  await addJobColumn("brand", "TEXT", "'Unknown'");
  await addJobColumn("model", "TEXT", "'Unknown'");
  await addJobColumn("serialOrImei", "TEXT");
  await addJobColumn("accessories", "TEXT");
  await addJobColumn("physicalNotes", "TEXT");
  await addJobColumn("clientApproved", "INTEGER");
  await addJobColumn("approvalDate", "DATETIME");
  await addJobColumn("quotedAt", "DATETIME");
  await addJobColumn("repairTimeline", "TEXT");
  await addJobColumn("clientPaid", "INTEGER", "0");
  await addJobColumn("clientPaidAt", "DATETIME");
  await addJobColumn("clientPaidById", "TEXT");
  await addJobColumn("clientPaymentRef", "TEXT");
  await addJobColumn("invoiceNumber", "TEXT");
  await addJobColumn("invoiceIssuedAt", "DATETIME");

  if (!cols.has("deviceId")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Job" ADD COLUMN "deviceId" TEXT');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Job_deviceId_idx" ON "Job"("deviceId")');
    changes.push({ kind: "alter_table", detail: "Added Job.deviceId (+ index)" });
  }

  // Delivery columns
  if (!cols.has("deliveredAt")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Job" ADD COLUMN "deliveredAt" DATETIME');
    changes.push({ kind: "alter_table", detail: "Added Job.deliveredAt" });
  }
  if (!cols.has("deliveryMethod")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Job" ADD COLUMN "deliveryMethod" TEXT');
    changes.push({ kind: "alter_table", detail: "Added Job.deliveryMethod" });
  }
  if (!cols.has("deliveredTo")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Job" ADD COLUMN "deliveredTo" TEXT');
    changes.push({ kind: "alter_table", detail: "Added Job.deliveredTo" });
  }

  // Software services (hardware vs software job types)
  await addJobColumn("serviceType", "TEXT", "'HARDWARE'");
  await addJobColumn("softwareOsInstall", "INTEGER", "0");
  await addJobColumn("softwareDriversUpdates", "INTEGER", "0");
  await addJobColumn("softwareDataBackupRestore", "INTEGER", "0");
  await addJobColumn("softwareAccountSetup", "INTEGER", "0");
  await addJobColumn("softwarePerformanceTune", "INTEGER", "0");
  await addJobColumn("softwareThirdPartyApps", "INTEGER", "0");
  await addJobColumn("softwareRequestedNotes", "TEXT");
  await addJobColumn("softwareLicenseAttested", "INTEGER", "0");
  await addJobColumn("softwareInstallerSource", "TEXT");
  await addJobColumn("softwareInstallerSourceNote", "TEXT");

  // Notifications
  const hasNotification = await tableExists("Notification");
  if (!hasNotification) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "type" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "jobId" TEXT,
        "userId" TEXT,
        "channel" TEXT NOT NULL DEFAULT 'DASHBOARD',
        "isRead" INTEGER NOT NULL DEFAULT 0,
        "readAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Notification_jobId_idx" ON "Notification"("jobId")');
    changes.push({ kind: "create_table", detail: "Created Notification + indexes" });
  }

  const hasPrefs = await tableExists("NotificationPreferences");
  if (!hasPrefs) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "NotificationPreferences" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "notifyStatusChange" INTEGER NOT NULL DEFAULT 1,
        "notifyApprovalNeeded" INTEGER NOT NULL DEFAULT 1,
        "notifyJobAssigned" INTEGER NOT NULL DEFAULT 1,
        "notifyEstimateSubmitted" INTEGER NOT NULL DEFAULT 1,
        "notifyPaymentReceived" INTEGER NOT NULL DEFAULT 1,
        "notifyPayoutGenerated" INTEGER NOT NULL DEFAULT 1,
        "notifyTimelineUpdated" INTEGER NOT NULL DEFAULT 1,
        "notifyDelayNote" INTEGER NOT NULL DEFAULT 1,
        "whatsappEnabled" INTEGER NOT NULL DEFAULT 1,
        "emailEnabled" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    changes.push({ kind: "create_table", detail: "Created NotificationPreferences" });
  }

  // Outbound WhatsApp outbox
  const hasOutbound = await tableExists("OutboundMessage");
  if (!hasOutbound) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OutboundMessage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "channel" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "type" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "provider" TEXT,
        "providerMessageId" TEXT,
        "attemptCount" INTEGER NOT NULL DEFAULT 0,
        "lastAttemptAt" DATETIME,
        "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "sentAt" DATETIME,
        "lastErrorCode" TEXT,
        "lastError" TEXT,
        "lockedAt" DATETIME,
        "repairRequestId" TEXT,
        "jobId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("repairRequestId") REFERENCES "RepairRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "OutboundMessage_channel_status_nextAttemptAt_idx" ON "OutboundMessage"("channel", "status", "nextAttemptAt")',
    );
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "OutboundMessage_repairRequestId_idx" ON "OutboundMessage"("repairRequestId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "OutboundMessage_jobId_idx" ON "OutboundMessage"("jobId")');
    changes.push({ kind: "create_table", detail: "Created OutboundMessage + indexes" });
  }

  // OutboundMessage delivery status columns
  if (await tableExists("OutboundMessage")) {
    const outboxCols = await prisma.$queryRaw<Array<{ name: string }>>`PRAGMA table_info('OutboundMessage')`;
    const outboxColSet = new Set(outboxCols.map((r) => r.name));
    const addOutboxColumn = async (name: string, type: string) => {
      if (outboxColSet.has(name)) return;
      await prisma.$executeRawUnsafe(`ALTER TABLE "OutboundMessage" ADD COLUMN "${name}" ${type}`);
      changes.push({ kind: "alter_table", detail: `Added OutboundMessage.${name}` });
    };

    await addOutboxColumn("providerDeliveryStatus", "TEXT");
    await addOutboxColumn("providerDeliveryAt", "DATETIME");
    await addOutboxColumn("providerDeliveryErrorCode", "TEXT");
    await addOutboxColumn("providerDeliveryError", "TEXT");
    // providerMessageId lookup
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "OutboundMessage_providerMessageId_idx" ON "OutboundMessage"("providerMessageId")');
  }

  // Branding table schema drift (add missing color columns if needed)
  if (await tableExists("DocumentBrandingSettings")) {
    const bcols = await brandingColumns();
    const addBrandingColumn = async (name: string, type: string, dflt?: string) => {
      if (bcols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "DocumentBrandingSettings" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added DocumentBrandingSettings.${name}` });
    };

    await addBrandingColumn("primaryColor", "TEXT", "'#000000'");
    await addBrandingColumn("secondaryColor", "TEXT", "'#D4AF37'");
    await addBrandingColumn("accentColor", "TEXT", "'#D4AF37'");
    await addBrandingColumn("backgroundColor", "TEXT", "'#FFFFFF'");
    await addBrandingColumn("surfaceColor", "TEXT", "'#F5F5F5'");
    await addBrandingColumn("borderColor", "TEXT", "'#E5E5E5'");
    await addBrandingColumn("signatureCompanyLabel", "TEXT", "'Signed by: Company'");
    await addBrandingColumn("signatureClientLabel", "TEXT", "'Signed by: Client'");
    await addBrandingColumn("signatureCompanyLabel", "TEXT");
    await addBrandingColumn("signatureClientLabel", "TEXT");
  }

  // Replace hardcoded "Eagle Info Solutions" in communication templates
  const templateTableExists = await tableExists("CommunicationTemplate");
  if (templateTableExists) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "CommunicationTemplate" SET body = REPLACE(body, 'Eagle Info Solutions', 'Your Repair Team') WHERE body LIKE '%Eagle Info Solutions%'`
    );
    if (updated > 0) {
      changes.push({ kind: "data_fix", detail: `Replaced 'Eagle Info Solutions' in ${updated} communication template(s)` });
    }
  }

  // Branches (multi-branch roll-out). Some production snapshots predate Branch + User.branchId.
  const hasBranch = await tableExists("Branch");
  if (!hasBranch) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Branch" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "address" TEXT,
        "phone" TEXT,
        "isDefault" INTEGER NOT NULL DEFAULT 0,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Branch_orgId_idx" ON "Branch"("orgId")');
    changes.push({ kind: "create_table", detail: "Created Branch + orgId index" });
  }

  const ucols = await userColumns();
  if (!ucols.has("branchId")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "branchId" TEXT');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "User_branchId_idx" ON "User"("branchId")');
    changes.push({ kind: "alter_table", detail: "Added User.branchId (+ index)" });
  }

  // Re-check and report
  const finalCols = await jobColumns();
  return NextResponse.json({
    ok: true,
    applied: changes,
    jobColumnsNow: [
      "deviceId",
      "deliveredAt",
      "deliveryMethod",
      "deliveredTo",
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
    ].map((c) => ({ c, present: finalCols.has(c) })),
    tablesNow: {
      Notification: await tableExists("Notification"),
      NotificationPreferences: await tableExists("NotificationPreferences"),
      OutboundMessage: await tableExists("OutboundMessage"),
      Device: await tableExists("Device"),
      Branch: await tableExists("Branch"),
    },
  });
}
