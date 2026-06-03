import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const DEFAULT_LOCAL_DATABASE_URL = (() => {
  const cwd = process.cwd();
  // Support running from `.next/standalone` where relative paths break.
  if (cwd.includes(".next/standalone")) {
    return `file:${cwd}/../../prisma/dev.db`;
  }
  return `file:${cwd}/prisma/dev.db`;
})();

function toSqliteAbsoluteUrl(url: string) {
  if (!url.startsWith("file:")) return url;
  const rawPath = url.slice("file:".length);
  if (!rawPath || rawPath.startsWith("/") || rawPath.startsWith("..")) return url;

  // Avoid path/process.cwd() here to prevent Turbopack over-tracing.
  // Dev scripts already run prisma db push/generate before dev/build.
  if (rawPath === "dev.db" || rawPath === "./dev.db" || rawPath === "prisma/dev.db" || rawPath === "./prisma/dev.db") {
    return DEFAULT_LOCAL_DATABASE_URL;
  }

  return url;
}

function createPrismaClient() {
  // Use TURSO_DATABASE_URL to detect production mode
  const isProduction = !!process.env.TURSO_DATABASE_URL;

  // GitHub Actions/CI runs Next in production mode but uses local sqlite.
  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  // When Next runs `next build`, NODE_ENV is production; allow local sqlite during build.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (
    process.env.NODE_ENV === "production" &&
    !isProduction &&
    !isBuildPhase &&
    !isCi &&
    process.env.ALLOW_SQLITE_PRODUCTION !== "1"
  ) {
    // Prefer a clear error over a noisy sqlite "unable to open" failure on serverless.
    throw new Error("Missing TURSO_DATABASE_URL (set Turso env vars for production runtime)");
  }

  if (!isProduction) {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      process.env.DATABASE_URL = toSqliteAbsoluteUrl(DEFAULT_LOCAL_DATABASE_URL);
    } else {
      process.env.DATABASE_URL = toSqliteAbsoluteUrl(databaseUrl);
    }

    return new PrismaClient({
      log: ["error", "warn"],
    });
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("Missing TURSO_DATABASE_URL");
  }

  const adapter = new PrismaLibSql({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

// If a cached singleton is missing recently-added models (stale hot-reload cache),
// discard it so a fresh client is created with the current generated schema.
function isStaleSingleton(client: PrismaClient | undefined): boolean {
  if (!client) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  return !c.complaint
    || !c.userGroup
    || !c.branch
    || !c.supplier
    || !c.salesTarget
    || !c.stockLocation
    || !c.stockTransfer
    || !c.purchaseRequest
    || !c.goodsReceived
    || !c.supplierBill
    || !c.supplierPayment
    || !c.stockCount
    || !c.taxRate
    || !c.expense
    || !c.recurringInvoice
    || !c.chartOfAccount
    || !c.journalEntry
    || !c.bankAccount
    || !c.campaign;
}

if (isStaleSingleton(globalForPrisma.prisma)) {
  try { void globalForPrisma.prisma?.$disconnect(); } catch { /* ignore */ }
  globalForPrisma.prisma = undefined;
}

const basePrisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

let paymentKindRepair: Promise<void> | null = null;
let leadLostReasonRepair: Promise<void> | null = null;

function isMissingPaymentKindError(error: unknown) {
  return String(error).includes("no such column: main.Payment.kind")
    || String(error).includes("no such column: Payment.kind");
}

function isMissingLeadLostReasonError(error: unknown) {
  return String(error).includes("no such column: main.Lead.lostReason")
    || String(error).includes("no such column: Lead.lostReason")
    || String(error).includes("no such column: lostReason");
}

function isDuplicateColumnError(error: unknown) {
  const message = String(error).toLowerCase();
  return message.includes("duplicate column name") || message.includes("already exists");
}

async function ensurePaymentKindColumn() {
  paymentKindRepair ??= basePrisma.$executeRawUnsafe(
    `ALTER TABLE "Payment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PAYMENT'`,
  ).then(
    () => undefined,
    (error) => {
      if (isDuplicateColumnError(error)) return undefined;
      paymentKindRepair = null;
      throw error;
    },
  );

  return paymentKindRepair;
}

async function ensureLeadLostReasonColumn() {
  leadLostReasonRepair ??= basePrisma.$executeRawUnsafe(
    `ALTER TABLE "Lead" ADD COLUMN "lostReason" TEXT`,
  ).then(
    () => undefined,
    (error) => {
      if (isDuplicateColumnError(error)) return undefined;
      leadLostReasonRepair = null;
      throw error;
    },
  );

  return leadLostReasonRepair;
}

export const prisma = basePrisma.$extends({
  query: {
    payment: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isMissingPaymentKindError(error)) throw error;
          await ensurePaymentKindColumn();
          return query(args);
        }
      },
    },
    lead: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isMissingLeadLostReasonError(error)) throw error;
          await ensureLeadLostReasonColumn();
          return query(args);
        }
      },
    },
  },
}) as unknown as PrismaClient;

// Eagerly start the engine connection so it's ready before the first request.
// Without this, Prisma 6's lazy initializer races against incoming requests
// (especially better-auth session checks) and throws "Engine is not yet connected".
void basePrisma.$connect().catch(() => {/* errors will surface on first query */});

// ── Org-scoped query layer ────────────────────────────────────────────────────
const ORG_SCOPED_MODELS = new Set([
  "Client", "Job", "Part", "Supplier", "Department",
  "Complaint", "Campaign", "Lead", "Quotation", "Sale",
  "Invoice", "InvoiceLine", "Payment", "PaymentAllocation", "Receipt",
  "Refund", "CreditNote", "DeliveryNote",
  "TechnicianPayout", "Expense", "JournalEntry", "ChartOfAccount", "BankAccount",
  "CommunicationTemplate", "CommunicationPolicy", "DocumentBrandingSettings",
  "StockLocation", "PurchaseOrder", "PurchaseRequest",
  "GoodsReceived", "SupplierBill", "RecurringInvoice",
  "RepairRequest", "PosSession", "SalesTarget", "FieldVisit",
  "StockCount", "StockTransfer", "TaxRate",
]);

const READ_OPS  = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);
const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const MUTATE_OPS = new Set(["update", "updateMany", "upsert", "delete", "deleteMany"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orgDb(orgId: string | null): any {
  if (!orgId) throw new Error("orgDb called without orgId — user is not in an organisation");
  const safeOrgId = orgId;
  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ args, query, model, operation }: any) {
          if (!ORG_SCOPED_MODELS.has(model)) return query(args);

          if (READ_OPS.has(operation)) {
            args = { ...args, where: { ...args.where, orgId: safeOrgId } };
          } else if (WRITE_OPS.has(operation)) {
            if (operation === "createMany" || operation === "createManyAndReturn") {
              if (Array.isArray(args.data)) {
                args = { ...args, data: args.data.map((d: Record<string, unknown>) => ({ ...d, orgId: safeOrgId })) };
              }
            } else if (args.data && typeof args.data === "object") {
              args = { ...args, data: { ...args.data, orgId: safeOrgId } };
            }
          } else if (MUTATE_OPS.has(operation)) {
            if (operation === "upsert") {
              args = { ...args, where: { ...args.where, orgId: safeOrgId }, create: { ...args.create, orgId: safeOrgId }, update: args.update };
            } else {
              args = { ...args, where: { ...args.where, orgId: safeOrgId } };
            }
          }

          return query(args);
        },
      },
    },
  }) as unknown as typeof prisma;
}
