import { NextResponse } from "next/server";

import { assertPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // Auth guard — only the platform admin may access this runner UI.
  const admin = await assertPlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

async function tableColumns(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info('${name.replaceAll("'", "''")}')`,
  );
  return new Set(rows.map((r) => r.name));
}

async function tableInfo(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; notnull: number }>>(
    `PRAGMA table_info('${name.replaceAll("'", "''")}')`,
  );
  return rows;
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

async function orgColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('Organization')
  `;
  return new Set(rows.map((r) => r.name));
}

async function userColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('User')
  `;
  return new Set(rows.map((r) => r.name));
}

async function supplierColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('Supplier')
  `;
  return new Set(rows.map((r) => r.name));
}

async function purchaseOrderColumns() {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    PRAGMA table_info('PurchaseOrder')
  `;
  return new Set(rows.map((r) => r.name));
}

export async function POST() {
  const user = await assertPlatformAdmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const changes: Array<{ kind: string; detail: string }> = [];

  // Organization: multi-currency columns
  try {
    const ocols = await orgColumns();
    const addOrgColumn = async (name: string, type: string, dflt?: string) => {
      if (ocols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "Organization" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added Organization.${name}` });
    };
    await addOrgColumn("baseCurrency", "TEXT", "'UGX'");
    await addOrgColumn("supportedCurrencies", "TEXT", "'UGX'");
  } catch {
    // ignore
  }

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
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT,
        "year" INTEGER NOT NULL,
        "value" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "RepairRequestSequence_orgId_year_key" ON "RepairRequestSequence"("orgId", "year")');
    changes.push({ kind: "create_table", detail: "Created RepairRequestSequence" });
  } else {
    // Upgrade legacy schema (year PK without orgId/id) to the current schema.
    const cols = await tableColumns("RepairRequestSequence");
    const legacy = cols.has("year") && cols.has("value") && !cols.has("id");
    if (legacy) {
      const defaultOrg = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
      if (!defaultOrg?.id) {
        changes.push({ kind: "warning", detail: "RepairRequestSequence legacy table found but no Organization rows exist; skipping upgrade." });
      } else {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "_RepairRequestSequence_new" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "orgId" TEXT,
            "year" INTEGER NOT NULL,
            "value" INTEGER NOT NULL DEFAULT 0,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "_RepairRequestSequence_new_orgId_year_key" ON "_RepairRequestSequence_new"("orgId", "year")');
        await prisma.$executeRawUnsafe(`
          INSERT OR REPLACE INTO "_RepairRequestSequence_new" (id, orgId, year, value, updatedAt)
          SELECT lower(hex(randomblob(16))), '${defaultOrg.id}', year, value, updatedAt FROM "RepairRequestSequence"
        `);
        await prisma.$executeRawUnsafe('DROP TABLE "RepairRequestSequence"');
        await prisma.$executeRawUnsafe('ALTER TABLE "_RepairRequestSequence_new" RENAME TO "RepairRequestSequence"');
        await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "RepairRequestSequence_orgId_year_key" ON "RepairRequestSequence"("orgId", "year")');
        changes.push({ kind: "alter_table", detail: "Upgraded legacy RepairRequestSequence schema" });
      }
    }
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

  // Invoices + Payments (partial payments)
  const hasInvoice = await tableExists("Invoice");
  if (!hasInvoice) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Invoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "jobId" TEXT NOT NULL UNIQUE,
        "invoiceNumber" TEXT NOT NULL UNIQUE,
        "currency" TEXT NOT NULL DEFAULT 'UGX',
        "status" TEXT NOT NULL DEFAULT 'ISSUED',
        "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "totalAmount" REAL NOT NULL,
        "paidAmount" REAL NOT NULL DEFAULT 0,
        "paidAt" DATETIME,
        "notes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Invoice_orgId_issuedAt_idx" ON "Invoice"("orgId", "issuedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Invoice_orgId_status_idx" ON "Invoice"("orgId", "status")');
    changes.push({ kind: "create_table", detail: "Created Invoice + indexes" });
  } else {
    const invCols = await tableColumns("Invoice");
    const addInvColumn = async (name: string, type: string, dflt?: string) => {
      if (invCols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added Invoice.${name}` });
    };
    await addInvColumn("orgId", "TEXT");
    await addInvColumn("jobId", "TEXT");
    await addInvColumn("invoiceNumber", "TEXT");
    await addInvColumn("currency", "TEXT", "'UGX'");
    await addInvColumn("status", "TEXT", "'ISSUED'");
    await addInvColumn("issuedAt", "DATETIME");
    await addInvColumn("totalAmount", "REAL", "0");
    await addInvColumn("paidAmount", "REAL", "0");
    await addInvColumn("paidAt", "DATETIME");
    await addInvColumn("notes", "TEXT");
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Invoice_orgId_issuedAt_idx" ON "Invoice"("orgId", "issuedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Invoice_orgId_status_idx" ON "Invoice"("orgId", "status")');
  }

  const hasPayment = await tableExists("Payment");
  if (!hasPayment) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "invoiceId" TEXT,
        "saleId" TEXT,
        "currency" TEXT NOT NULL DEFAULT 'UGX',
        "exchangeRateToBase" REAL,
        "amount" REAL NOT NULL,
        "method" TEXT NOT NULL DEFAULT 'CASH',
        "reference" TEXT,
        "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdById" TEXT,
        "note" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_orgId_receivedAt_idx" ON "Payment"("orgId", "receivedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment"("saleId")');
    changes.push({ kind: "create_table", detail: "Created Payment + indexes" });
  } else {
    const payCols = await tableColumns("Payment");
    const addPayColumn = async (name: string, type: string, dflt?: string) => {
      if (payCols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "Payment" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added Payment.${name}` });
    };
    await addPayColumn("orgId", "TEXT");
    await addPayColumn("invoiceId", "TEXT");
    await addPayColumn("saleId", "TEXT");
    await addPayColumn("currency", "TEXT", "'UGX'");
    await addPayColumn("exchangeRateToBase", "REAL");
    await addPayColumn("amount", "REAL", "0");
    await addPayColumn("method", "TEXT", "'CASH'");
    await addPayColumn("reference", "TEXT");
    await addPayColumn("receivedAt", "DATETIME");
    await addPayColumn("createdById", "TEXT");
    await addPayColumn("note", "TEXT");

    // If this DB was created before POS, invoiceId might be NOT NULL.
    // Rebuild to allow sale-only payments.
    const payInfo = await tableInfo("Payment");
    const invoiceIdNotNull = payInfo.find((c) => c.name === "invoiceId")?.notnull === 1;
    if (invoiceIdNotNull) {
      await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "_Payment_new" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orgId" TEXT NOT NULL,
          "invoiceId" TEXT,
          "saleId" TEXT,
          "currency" TEXT NOT NULL DEFAULT 'UGX',
          "exchangeRateToBase" REAL,
          "amount" REAL NOT NULL,
          "method" TEXT NOT NULL DEFAULT 'CASH',
          "reference" TEXT,
          "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdById" TEXT,
          "note" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `);

      const hasSaleId = payCols.has("saleId");
      const hasCurrency = payCols.has("currency");
      const hasRate = payCols.has("exchangeRateToBase");
      await prisma.$executeRawUnsafe(`
        INSERT OR REPLACE INTO "_Payment_new" (id, orgId, invoiceId, saleId, currency, exchangeRateToBase, amount, method, reference, receivedAt, createdById, note, createdAt)
        SELECT
          id,
          orgId,
          invoiceId,
          ${hasSaleId ? "saleId" : "NULL"} as saleId,
          ${hasCurrency ? "currency" : "'UGX'"} as currency,
          ${hasRate ? "exchangeRateToBase" : "NULL"} as exchangeRateToBase,
          amount,
          method,
          reference,
          receivedAt,
          createdById,
          note,
          createdAt
        FROM "Payment"
      `);
      await prisma.$executeRawUnsafe('DROP TABLE "Payment"');
      await prisma.$executeRawUnsafe('ALTER TABLE "_Payment_new" RENAME TO "Payment"');
      await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=ON;`);
      changes.push({ kind: "alter_table", detail: "Rebuilt Payment to allow invoiceId nullable" });
    }

    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_orgId_receivedAt_idx" ON "Payment"("orgId", "receivedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Payment_saleId_idx" ON "Payment"("saleId")');
  }

  // Sales (POS)
  const hasSale = await tableExists("Sale");
  if (!hasSale) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Sale" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "branchId" TEXT,
        "clientId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "saleNumber" TEXT NOT NULL UNIQUE,
        "billingMode" TEXT NOT NULL DEFAULT 'CASH',
        "invoiceNumber" TEXT,
        "invoicedAt" DATETIME,
        "currency" TEXT NOT NULL DEFAULT 'UGX',
        "subtotal" REAL NOT NULL DEFAULT 0,
        "discountAmount" REAL NOT NULL DEFAULT 0,
        "vatAmount" REAL NOT NULL DEFAULT 0,
        "totalAmount" REAL NOT NULL DEFAULT 0,
        "paidAmount" REAL NOT NULL DEFAULT 0,
        "paidAt" DATETIME,
        "notes" TEXT,
        "createdById" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_orgId_createdAt_idx" ON "Sale"("orgId", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_orgId_status_idx" ON "Sale"("orgId", "status")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_branchId_idx" ON "Sale"("branchId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_clientId_idx" ON "Sale"("clientId")');
    changes.push({ kind: "create_table", detail: "Created Sale + indexes" });
  } else {
    const saleCols = await tableColumns("Sale");
    const addSaleColumn = async (name: string, type: string, dflt?: string) => {
      if (saleCols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "Sale" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added Sale.${name}` });
    };

    await addSaleColumn("orgId", "TEXT");
    await addSaleColumn("branchId", "TEXT");
    await addSaleColumn("clientId", "TEXT");
    await addSaleColumn("status", "TEXT", "'OPEN'");
    await addSaleColumn("saleNumber", "TEXT");
    await addSaleColumn("billingMode", "TEXT", "'CASH'");
    await addSaleColumn("invoiceNumber", "TEXT");
    await addSaleColumn("invoicedAt", "DATETIME");
    await addSaleColumn("currency", "TEXT", "'UGX'");
    await addSaleColumn("subtotal", "REAL", "0");
    await addSaleColumn("discountAmount", "REAL", "0");
    await addSaleColumn("vatAmount", "REAL", "0");
    await addSaleColumn("totalAmount", "REAL", "0");
    await addSaleColumn("paidAmount", "REAL", "0");
    await addSaleColumn("paidAt", "DATETIME");
    await addSaleColumn("notes", "TEXT");
    await addSaleColumn("createdById", "TEXT");
    await addSaleColumn("createdAt", "DATETIME");
    await addSaleColumn("updatedAt", "DATETIME");
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_orgId_createdAt_idx" ON "Sale"("orgId", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_orgId_status_idx" ON "Sale"("orgId", "status")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_branchId_idx" ON "Sale"("branchId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_clientId_idx" ON "Sale"("clientId")');
  }

  const hasSaleItem = await tableExists("SaleItem");
  if (!hasSaleItem) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SaleItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "saleId" TEXT NOT NULL,
        "partId" TEXT,
        "description" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "unitPrice" REAL NOT NULL,
        "lineTotal" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SaleItem_partId_idx" ON "SaleItem"("partId")');
    changes.push({ kind: "create_table", detail: "Created SaleItem + index" });
  } else {
    const itemCols = await tableColumns("SaleItem");
    if (!itemCols.has("partId")) {
      await prisma.$executeRawUnsafe('ALTER TABLE "SaleItem" ADD COLUMN "partId" TEXT');
      changes.push({ kind: "alter_table", detail: "Added SaleItem.partId" });
    }
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SaleItem_partId_idx" ON "SaleItem"("partId")');
  }

  // Delivery notes (sale fulfillment)
  const hasDeliveryNote = await tableExists("DeliveryNote");
  if (!hasDeliveryNote) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeliveryNote" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "saleId" TEXT NOT NULL,
        "deliveryNoteNumber" TEXT NOT NULL UNIQUE,
        "deliveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deliveryMethod" TEXT,
        "deliveredByName" TEXT NOT NULL,
        "receivedByName" TEXT NOT NULL,
        "receivedBySignatureText" TEXT,
        "note" TEXT,
        "createdById" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DeliveryNote_orgId_deliveredAt_idx" ON "DeliveryNote"("orgId", "deliveredAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DeliveryNote_saleId_idx" ON "DeliveryNote"("saleId")');
    changes.push({ kind: "create_table", detail: "Created DeliveryNote + indexes" });
  }

  const hasDeliveryNoteItem = await tableExists("DeliveryNoteItem");
  if (!hasDeliveryNoteItem) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeliveryNoteItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "deliveryNoteId" TEXT NOT NULL,
        "saleItemId" TEXT,
        "partId" TEXT,
        "description" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_saleItemId_idx" ON "DeliveryNoteItem"("saleItemId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DeliveryNoteItem_partId_idx" ON "DeliveryNoteItem"("partId")');
    changes.push({ kind: "create_table", detail: "Created DeliveryNoteItem + indexes" });
  }

  // Credit notes (sale-only) + credit note items
  const hasCreditNote = await tableExists("CreditNote");
  if (!hasCreditNote) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CreditNote" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "saleId" TEXT NOT NULL,
        "creditNoteNumber" TEXT NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'UGX',
        "totalAmount" REAL NOT NULL,
        "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "reason" TEXT,
        "itemsReceivedBackAt" DATETIME,
        "itemsReceivedBackById" TEXT,
        "itemsReceivedBackNote" TEXT,
        "createdById" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("itemsReceivedBackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CreditNote_orgId_issuedAt_idx" ON "CreditNote"("orgId", "issuedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CreditNote_saleId_idx" ON "CreditNote"("saleId")');
    changes.push({ kind: "create_table", detail: "Created CreditNote + indexes" });
  }

  const hasCreditNoteItem = await tableExists("CreditNoteItem");
  if (!hasCreditNoteItem) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CreditNoteItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "creditNoteId" TEXT NOT NULL,
        "partId" TEXT,
        "description" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "unitPrice" REAL NOT NULL,
        "lineTotal" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CreditNoteItem_partId_idx" ON "CreditNoteItem"("partId")');
    changes.push({ kind: "create_table", detail: "Created CreditNoteItem + indexes" });
  }

  // Refunds (cash-out)
  const hasRefund = await tableExists("Refund");
  if (!hasRefund) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Refund" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "saleId" TEXT,
        "invoiceId" TEXT,
        "creditNoteId" TEXT,
        "currency" TEXT NOT NULL DEFAULT 'UGX',
        "exchangeRateToBase" REAL,
        "amount" REAL NOT NULL,
        "method" TEXT NOT NULL DEFAULT 'CASH',
        "reference" TEXT,
        "refundedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdById" TEXT NOT NULL,
        "note" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Refund_orgId_refundedAt_idx" ON "Refund"("orgId", "refundedAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Refund_saleId_idx" ON "Refund"("saleId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Refund_invoiceId_idx" ON "Refund"("invoiceId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Refund_creditNoteId_idx" ON "Refund"("creditNoteId")');
    changes.push({ kind: "create_table", detail: "Created Refund + indexes" });
  }

  // Stock transactions: add saleId link if missing
  if (await tableExists("PartStockTransaction")) {
    const stCols = await tableColumns("PartStockTransaction");
    if (!stCols.has("saleId")) {
      await prisma.$executeRawUnsafe('ALTER TABLE "PartStockTransaction" ADD COLUMN "saleId" TEXT');
      changes.push({ kind: "alter_table", detail: "Added PartStockTransaction.saleId" });
    }
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PartStockTransaction_saleId_idx" ON "PartStockTransaction"("saleId")');
  }

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

  // Branch scoping for jobs (added later in commercial roll-out).
  await addJobColumn("branchId", "TEXT");
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Job_branchId_idx" ON "Job"("branchId")');

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

    await addBrandingColumn("invoiceTemplateKey", "TEXT", "'invoice_classic'");
    await addBrandingColumn("quotationTemplateKey", "TEXT", "'quote_classic'");
    await addBrandingColumn("jobCardTemplateKey", "TEXT", "'job_card_classic'");
    await addBrandingColumn("receiptTemplateKey", "TEXT", "'receipt_classic'");
  }

  // Communication templates are org-owned and user-defined.
  // Do not mutate template bodies during db-fix.

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

  // Suppliers + Purchase Orders
  const hasSupplier = await tableExists("Supplier");
  if (!hasSupplier) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Supplier" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "contactName" TEXT,
        "email" TEXT,
        "phone" TEXT,
        "address" TEXT,
        "notes" TEXT,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Supplier_orgId_idx" ON "Supplier"("orgId")');
    changes.push({ kind: "create_table", detail: "Created Supplier + orgId index" });
  }

  const hasPurchaseOrder = await tableExists("PurchaseOrder");
  if (!hasPurchaseOrder) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL,
        "supplierId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "reference" TEXT,
        "orderedAt" DATETIME,
        "expectedAt" DATETIME,
        "receivedAt" DATETIME,
        "notes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PurchaseOrder_orgId_idx" ON "PurchaseOrder"("orgId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId")');
    changes.push({ kind: "create_table", detail: "Created PurchaseOrder + indexes" });
  }

  const hasPurchaseOrderItem = await tableExists("PurchaseOrderItem");
  if (!hasPurchaseOrderItem) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "poId" TEXT NOT NULL,
        "partId" TEXT,
        "description" TEXT NOT NULL,
        "qtyOrdered" INTEGER NOT NULL,
        "qtyReceived" INTEGER NOT NULL DEFAULT 0,
        "unitCost" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_poId_idx" ON "PurchaseOrderItem"("poId")');
    changes.push({ kind: "create_table", detail: "Created PurchaseOrderItem + poId index" });
  }

  // Ensure schema drift doesn't break Prisma reads after partial deploys.
  if (await tableExists("Supplier")) {
    const scols = await supplierColumns();
    const addSupplierColumn = async (name: string, type: string, dflt?: string) => {
      if (scols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "Supplier" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added Supplier.${name}` });
    };
    await addSupplierColumn("isActive", "INTEGER", "1");
  }

  if (await tableExists("PurchaseOrder")) {
    const pcols = await purchaseOrderColumns();
    const addPOColumn = async (name: string, type: string, dflt?: string) => {
      if (pcols.has(name)) return;
      const defaultClause = dflt ? ` DEFAULT ${dflt}` : "";
      await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN "${name}" ${type}${defaultClause}`);
      changes.push({ kind: "alter_table", detail: `Added PurchaseOrder.${name}` });
    };
    await addPOColumn("status", "TEXT", "'DRAFT'");
    await addPOColumn("reference", "TEXT");
    await addPOColumn("orderedAt", "DATETIME");
    await addPOColumn("expectedAt", "DATETIME");
    await addPOColumn("receivedAt", "DATETIME");
    await addPOColumn("notes", "TEXT");
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
      Supplier: await tableExists("Supplier"),
      PurchaseOrder: await tableExists("PurchaseOrder"),
      PurchaseOrderItem: await tableExists("PurchaseOrderItem"),
    },
  });
}
