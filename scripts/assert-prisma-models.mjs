import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

const missing = requiredModels.filter((model) => typeof prisma[model]?.findMany !== "function");

await prisma.$disconnect().catch(() => undefined);

if (missing.length > 0) {
  console.error(`Generated Prisma Client is missing required models: ${missing.join(", ")}`);
  console.error("Run `bunx prisma generate` from the current schema before building/deploying.");
  process.exit(1);
}
