import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

interface CreateRepairRequestInput {
  orgId?: string;
  customerName: string;
  phone: string;
  email?: string;
  preferredContactMethod?: "WHATSAPP" | "PHONE" | "EMAIL" | "SMS";
  deviceType: string;
  brand: string;
  model?: string;
  serialNumber?: string;
  problemDescription: string;
  handoverMethod: "SELF_DROPOFF" | "SEND_WITH_DELIVERY_PERSON" | "REQUEST_PICKUP";
  preferredDropoffDate?: string;
  preferredDropoffTime?: string;
  dropoffNotes?: string;
  deliveryPersonName?: string;
  deliveryPersonPhone?: string;
  deliveryCompany?: string;
  dispatchDate?: string;
  expectedArrivalTime?: string;
  deliveryTrackingReference?: string;
  deliveryFeeResponsibility?: string;
  deliveryNotes?: string;
  pickupAddress?: string;
  pickupLandmark?: string;
  preferredPickupDate?: string;
  preferredPickupTime?: string;
  alternateContactPerson?: string;
  alternateContactPhone?: string;
  pickupNotes?: string;
  submissionIp?: string;
}

async function allocateRequestNumber(orgId?: string | null): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;

  // Repair requests are tenant-scoped; sequences must not use NULL orgIds because
  // SQLite UNIQUE constraints treat NULLs as distinct (breaking atomic upserts).
  if (!orgId) {
    const fromEnv = process.env.DEFAULT_ORG_ID?.trim();
    if (fromEnv) orgId = fromEnv;
  }
  if (!orgId) {
    const onlyOrg = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
    orgId = onlyOrg?.id ?? null;
  }
  if (!orgId) {
    throw new Error("No organisation configured for repair requests (missing DEFAULT_ORG_ID).");
  }

  const ensureSequenceTable = async () => {
    // Some environments (e.g. Turso drift) may be missing this table.
    // This is safe to run repeatedly.
    // Keep this aligned with prisma/schema.prisma model RepairRequestSequence.
    // This also makes the code resilient to DB drift in production.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RepairRequestSequence" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "orgId" TEXT,
        "year" INTEGER NOT NULL,
        "value" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RepairRequestSequence_orgId_year_key" ON "RepairRequestSequence"("orgId", "year")
    `);
  };

  const getMaxExisting = async () => {
    const last = await prisma.repairRequest.findFirst({
      where: { requestNumber: { startsWith: prefix } },
      orderBy: { requestNumber: "desc" },
      select: { requestNumber: true },
    });

    const lastSeqRaw = last?.requestNumber.slice(prefix.length);
    const lastSeq = lastSeqRaw ? Number.parseInt(lastSeqRaw, 10) : 0;
    return Number.isFinite(lastSeq) ? lastSeq : 0;
  };

  // Always ensure the table exists before touching it (CREATE TABLE IF NOT EXISTS is a no-op when present).
  await ensureSequenceTable();

  // Ensure sequence row exists and is caught up to the max observed number.
  const maxExisting = await getMaxExisting();

  // Allocate the next number atomically.
  // We also catch up to the max observed request number to stay monotonic.
  const rows = await prisma.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "RepairRequestSequence" (id, orgId, year, value, updatedAt)
    VALUES (${randomUUID()}, ${orgId}, ${year}, ${maxExisting + 1}, CURRENT_TIMESTAMP)
    ON CONFLICT(orgId, year) DO UPDATE SET value = (CASE WHEN value < ${maxExisting} THEN ${maxExisting} ELSE value END) + 1, updatedAt = CURRENT_TIMESTAMP
    RETURNING value
  `;
  const nextVal = rows[0]?.value ?? 1;
  return `${prefix}${String(nextVal).padStart(4, "0")}`;
}

export async function createRepairRequest(
  input: CreateRepairRequestInput
): Promise<{ success: boolean; requestId?: string; requestNumber?: string; error?: string }> {
  try {
    const resolvedOrgId =
      input.orgId?.trim() ||
      process.env.DEFAULT_ORG_ID?.trim() ||
      (await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }))?.id ||
      null;

    // Request numbers must be human-friendly but also safe under concurrency.
    // We allocate from a per-year sequence table, and still retry in case the
    // requestNumber uniqueness constraint is hit for any unexpected reason.
    let request:
      | {
          id: string;
          requestNumber: string;
        }
      | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const requestNumber = await allocateRequestNumber(resolvedOrgId);
      try {
        request = await prisma.repairRequest.create({
          data: {
            requestNumber,
            requestStatus: "PENDING_FRONT_DESK",
            handoverStatus: "PENDING",
            orgId: resolvedOrgId,
            customerName: input.customerName,
            phone: input.phone,
            email: input.email,
            preferredContactMethod: input.preferredContactMethod || "WHATSAPP",
            deviceType: input.deviceType as import("@prisma/client").DeviceType,
            brand: input.brand,
            model: input.model?.trim() ? input.model.trim() : null,
            serialNumber: input.serialNumber,
            problemDescription: input.problemDescription,
            handoverMethod: input.handoverMethod,
            preferredDropoffDate: input.preferredDropoffDate,
            preferredDropoffTime: input.preferredDropoffTime,
            dropoffNotes: input.dropoffNotes,
            deliveryPersonName: input.deliveryPersonName,
            deliveryPersonPhone: input.deliveryPersonPhone,
            deliveryCompany: input.deliveryCompany,
            dispatchDate: input.dispatchDate,
            expectedArrivalTime: input.expectedArrivalTime,
            deliveryTrackingReference: input.deliveryTrackingReference,
            deliveryFeeResponsibility: input.deliveryFeeResponsibility,
            deliveryNotes: input.deliveryNotes,
            pickupAddress: input.pickupAddress,
            pickupLandmark: input.pickupLandmark,
            preferredPickupDate: input.preferredPickupDate,
            preferredPickupTime: input.preferredPickupTime,
            alternateContactPerson: input.alternateContactPerson,
            alternateContactPhone: input.alternateContactPhone,
            pickupNotes: input.pickupNotes,
            submissionIp: input.submissionIp,
          },
          select: { id: true, requestNumber: true },
        });
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("UNIQUE constraint failed") && msg.includes("RepairRequest.requestNumber")) {
          continue;
        }
        throw error;
      }
    }

    if (!request) {
      return { success: false, error: "Could not allocate a unique request number. Please retry." };
    }

    return { success: true, requestId: request.id, requestNumber: request.requestNumber };
  } catch (error) {
    console.error("[RepairRequestService] Create error:", error);
    return { success: false, error: String(error) };
  }
}
