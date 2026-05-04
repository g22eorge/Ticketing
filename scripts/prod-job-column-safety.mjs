#!/usr/bin/env node
import { createClient } from "@libsql/client";

const url =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "file:./prisma/dev.db";

const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(
  authToken
    ? {
        url,
        authToken,
      }
    : { url },
);

const requiredColumns = [
  { name: "deviceType", ddl: 'TEXT DEFAULT \'OTHER\'' },
  { name: "brand", ddl: 'TEXT DEFAULT \'Unknown\'' },
  { name: "model", ddl: 'TEXT DEFAULT \'Unknown\'' },
  { name: "serialOrImei", ddl: "TEXT" },
  { name: "accessories", ddl: "TEXT" },
  { name: "physicalNotes", ddl: "TEXT" },
  { name: "clientApproved", ddl: "INTEGER" },
  { name: "approvalDate", ddl: "DATETIME" },
  { name: "quotedAt", ddl: "DATETIME" },
  { name: "repairTimeline", ddl: "TEXT" },
  { name: "clientPaid", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { name: "clientPaidAt", ddl: "DATETIME" },
  { name: "clientPaidById", ddl: "TEXT" },
  { name: "clientPaymentRef", ddl: "TEXT" },
  { name: "invoiceNumber", ddl: "TEXT" },
  { name: "invoiceIssuedAt", ddl: "DATETIME" },
  { name: "serviceType", ddl: "TEXT DEFAULT 'HARDWARE'" },
  { name: "communicationStatus", ddl: "TEXT DEFAULT 'NONE'" },
];

async function getColumns(tableName) {
  const result = await client.execute(`PRAGMA table_info('${tableName}')`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function ensureColumns() {
  const existing = await getColumns("Job");
  const applied = [];

  for (const column of requiredColumns) {
    if (existing.has(column.name)) continue;
    await client.execute(`ALTER TABLE "Job" ADD COLUMN "${column.name}" ${column.ddl}`);
    applied.push(column.name);
  }

  return applied;
}

async function normalizeData() {
  const statements = [
    "UPDATE \"Job\" SET \"brand\" = 'Unknown' WHERE \"brand\" IS NULL OR TRIM(\"brand\") = ''",
    "UPDATE \"Job\" SET \"model\" = 'Unknown' WHERE \"model\" IS NULL OR TRIM(\"model\") = ''",
    "UPDATE \"Job\" SET \"deviceType\" = 'OTHER' WHERE \"deviceType\" IS NULL OR TRIM(\"deviceType\") = ''",
    "UPDATE \"Job\" SET \"clientPaid\" = 0 WHERE \"clientPaid\" IS NULL",
    "UPDATE \"Job\" SET \"status\" = 'IN_REPAIR' WHERE \"status\" NOT IN ('RECEIVED','DIAGNOSING','PENDING_EXTERNAL_ASSIGNMENT','ASSIGNED_ONE_TIME_EXTERNAL','IN_EXTERNAL_REPAIR','WAITING_FOR_PARTS','RETURNED_FROM_EXTERNAL','AWAITING_APPROVAL','IN_REPAIR','READY_FOR_PICKUP','COMPLETED','DELIVERED','CLOSED')",
    "UPDATE \"Job\" SET \"repairPath\" = NULL WHERE \"repairPath\" IS NOT NULL AND \"repairPath\" NOT IN ('IN_HOUSE','EXTERNAL')",
    "UPDATE \"Job\" SET \"serviceType\" = 'HARDWARE' WHERE \"serviceType\" IS NULL OR \"serviceType\" NOT IN ('HARDWARE','SOFTWARE','BOTH')",
    "UPDATE \"Job\" SET \"communicationStatus\" = 'NONE' WHERE \"communicationStatus\" IS NULL OR \"communicationStatus\" NOT IN ('NONE','NEEDED','SENT','REPLIED')",
  ];

  for (const statement of statements) {
    await client.execute(statement);
  }
}

try {
  const appliedColumns = await ensureColumns();
  await normalizeData();
  const finalColumns = Array.from(await getColumns("Job")).sort();

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseUrl: url,
        appliedColumns,
        jobColumns: finalColumns,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
} finally {
  client.close();
}
