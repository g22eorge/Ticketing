// Check required Prisma models exist in the generated client using the DMMF
// (Data Model Meta Format) — zero database connection, no URL validation.
// PrismaClient instantiation triggers Prisma's runtime schema check against
// DATABASE_URL which fails when DATABASE_URL is a Turso libsql:// URL.
import { Prisma } from "@prisma/client";

const requiredModels = [
  "supplier",
  "stockLocation",
  "stockTransfer",
  "purchaseRequest",
  "purchaseOrder",
  "goodsReceived",
  "supplierBill",
  "supplierPayment",
  "stockCount",
];

// Read generated model names from DMMF — no DB connection needed
const generatedModels = new Set(
  Prisma.dmmf.datamodel.models.map(
    (m) => m.name.charAt(0).toLowerCase() + m.name.slice(1)
  )
);

const missing = requiredModels.filter((model) => !generatedModels.has(model));

if (missing.length > 0) {
  console.error(`Generated Prisma Client is missing required models: ${missing.join(", ")}`);
  console.error("Run `bunx prisma generate` from the current schema before building/deploying.");
  process.exit(1);
}

console.log(`✓ All ${requiredModels.length} required Prisma models present.`);
