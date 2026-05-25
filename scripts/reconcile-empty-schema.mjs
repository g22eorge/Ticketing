import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const DATA_TABLES = [
  "User",
  "Client",
  "Job",
  "Photo",
  "AuditLog",
  "Invoice",
  "Sale",
  "Part",
  "Supplier",
  "RepairRequest",
];

const DUPLICATE_EMPTY_DB_INDEXES = [
  "Invoice_jobId_key",
  "Quotation_convertedToInvoiceId_key",
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const prisma = new PrismaClient();

try {
  if (process.env.ALLOW_EMPTY_DB_RECONCILE !== "1") {
    throw new Error("Refusing to reconcile schema without ALLOW_EMPTY_DB_RECONCILE=1");
  }

  let totalRows = 0;
  for (const table of DATA_TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${table}"`);
      totalRows += Number(rows[0]?.count ?? 0);
    } catch {
      // Missing tables are expected on partially migrated fresh databases.
    }
  }

  if (totalRows > 0) {
    console.log(`Skipping empty DB reconciliation because protected tables contain data (${totalRows} rows).`);
    process.exit(0);
  }

  for (const index of DUPLICATE_EMPTY_DB_INDEXES) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${index}"`);
  }

  run("bunx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"]);
} finally {
  await prisma.$disconnect();
}
