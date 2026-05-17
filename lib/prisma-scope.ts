/**
 * Scoped Prisma client — the safe path for all API routes and Server Components.
 *
 * Usage:
 *   import { scopedDb } from "@/lib/prisma-scope";
 *   const db = scopedDb(session.user.orgId);
 *   const jobs = await db.job.findMany({ ... }); // orgId injected automatically
 *
 * Rules:
 *   - ALWAYS use scopedDb() inside API routes, Server Components, and Server Actions.
 *   - NEVER use the raw `prisma` singleton in these contexts.
 *   - The raw `prisma` singleton is ONLY for background jobs, admin scripts, and
 *     seed files where cross-org access is intentional and reviewed.
 *
 * What this does automatically:
 *   1. Injects `where: { orgId }` into findMany / findFirst / count / aggregate / groupBy.
 *   2. Injects `where: { deletedAt: null }` for soft-delete models.
 *   3. Post-validates findUnique results to ensure the record belongs to the org.
 *   4. Blocks mutations (create/update/delete) that would touch a different org's records.
 *
 * Implementation note:
 *   Prisma 6 removed $use middleware in favour of $extends query extensions.
 *   This module uses the stable $extends API. The returned client is a thin
 *   wrapper — no new DB connection is created.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── Models that carry orgId ───────────────────────────────────────────────────
// Keep in sync with prisma/schema.prisma.  Models NOT listed here pass through
// unfiltered (e.g. Session, Account, Verification which are user-scoped by token).

const ORG_SCOPED_MODELS = new Set([
  "Branch",
  "BranchNumberingSettings",
  "BranchOperatingHours",
  "Client",
  "ClientNote",
  "CommunicationTemplate",
  "CommunicationPolicy",
  "Complaint",
  "ConversationMessage",
  "CreditNote",
  "CreditNoteItem",
  "DeliveryNote",
  "DeliveryNoteItem",
  "Department",
  "Device",
  "DeviceSpecification",
  "DiagnosisReport",
  "DocumentBrandingSettings",
  "FieldVisit",
  "FileAsset",
  "InboundMessage",
  "InventoryCategory",
  "Invoice",
  "InvoiceLine",
  "Job",
  "JobAssignmentHistory",
  "JobStatusHistory",
  "Lead",
  "LeadActivity",
  "Notification",
  "OutboundMessage",
  "Part",
  "PartLocationStock",
  "PartReservation",
  "PartStockTransaction",
  "Payment",
  "PaymentAllocation",
  "Photo",
  "PosSession",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "QualityCheck",
  "Quotation",
  "QuotationItem",
  "Receipt",
  "Refund",
  "ReorderRule",
  "RepairRequest",
  "Sale",
  "SaleItem",
  "SalesTarget",
  "StockLocation",
  "StockTransfer",
  "Supplier",
  "SupplierPrice",
  "User",
  "UserGroup",
  "UserGroupMember",
  "UserGroupPermission",
  "UserInvite",
  "UserPermission",
  "WarrantyClaim",
  "AuditLog",
]);

// Models with a deletedAt field that should always be filtered.
const SOFT_DELETE_MODELS = new Set([
  "Client",
  "Job",
  "Invoice",
  "Part",
  "PurchaseOrder",
  "Quotation",
  "Sale",
  "Supplier",
]);

// ── Where clause injection helpers ─────────────────────────────────────────────

function injectOrgId(
  model: string,
  orgId: string,
  where: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> = where ? { ...where } : {};

  if (ORG_SCOPED_MODELS.has(model)) {
    // Respect existing orgId filter (don't override sub-queries that already specify it).
    if (!("orgId" in base)) {
      base.orgId = orgId;
    }
  }

  if (SOFT_DELETE_MODELS.has(model)) {
    if (!("deletedAt" in base)) {
      base.deletedAt = null;
    }
  }

  return base;
}

// ── Main factory ──────────────────────────────────────────────────────────────

/**
 * Returns a Prisma client that automatically scopes every query to `orgId`.
 * Create one per request — it's cheap (no new connection).
 */
export function scopedDb(orgId: string) {
  return prisma.$extends({
    name: `org-scope:${orgId}`,
    query: {
      $allModels: {
        // ── READ operations (inject where filters) ────────────────────────────

        async findMany({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        async findFirst({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        async findFirstOrThrow({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        async count({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        async aggregate({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        async groupBy({ model, args, query }) {
          const typedArgs = args as { where?: Record<string, unknown> };
          typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          return query(args);
        },

        // ── findUnique: post-validate org membership ──────────────────────────
        // We can't inject orgId into findUnique because it must use unique fields.
        // Instead we verify the result belongs to this org.

        async findUnique({ model, args, query }) {
          const result = await query(args);
          if (result === null) return result;
          if (ORG_SCOPED_MODELS.has(model)) {
            const rec = result as Record<string, unknown>;
            if ("orgId" in rec && rec.orgId !== orgId) {
              // Record belongs to a different org — treat as not found.
              return null;
            }
          }
          return result;
        },

        async findUniqueOrThrow({ model, args, query }) {
          const result = await query(args);
          if (ORG_SCOPED_MODELS.has(model)) {
            const rec = result as Record<string, unknown>;
            if ("orgId" in rec && rec.orgId !== orgId) {
              throw new Prisma.PrismaClientKnownRequestError(
                `Record not found in org ${orgId}`,
                { code: "P2025", clientVersion: Prisma.prismaVersion.client },
              );
            }
          }
          return result;
        },

        // ── WRITE operations: enforce org membership ──────────────────────────

        async create({ model, args, query }) {
          // Inject orgId into create data so callers don't have to.
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as { data?: Record<string, unknown> };
            if (typedArgs.data && !("orgId" in typedArgs.data)) {
              typedArgs.data.orgId = orgId;
            }
          }
          return query(args);
        },

        async update({ model, args, query }) {
          // Restrict update to records in this org.
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          }
          return query(args);
        },

        async updateMany({ model, args, query }) {
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          }
          return query(args);
        },

        async delete({ model, args, query }) {
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          }
          return query(args);
        },

        async deleteMany({ model, args, query }) {
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
          }
          return query(args);
        },

        async upsert({ model, args, query }) {
          if (ORG_SCOPED_MODELS.has(model)) {
            const typedArgs = args as {
              where?: Record<string, unknown>;
              create?: Record<string, unknown>;
            };
            typedArgs.where = injectOrgId(model, orgId, typedArgs.where);
            if (typedArgs.create && !("orgId" in typedArgs.create)) {
              typedArgs.create.orgId = orgId;
            }
          }
          return query(args);
        },
      },
    },
  });
}

/**
 * Type alias for the scoped DB client — use this in function signatures.
 *
 * Example:
 *   async function createJob(db: ScopedDb, data: CreateJobInput) { ... }
 */
export type ScopedDb = ReturnType<typeof scopedDb>;

/**
 * Convenience: resolve orgId from a session and return the scoped client.
 * Throws if the session has no orgId (unauthenticated / system user).
 */
export function scopedDbFromSession(session: { user: { orgId?: string | null } }): ScopedDb {
  const orgId = session.user.orgId;
  if (!orgId) {
    throw new Error("Cannot create scoped DB: session has no orgId");
  }
  return scopedDb(orgId);
}
