/**
 * InventoryService — the ONLY module authorised to mutate stock balances.
 *
 * Architectural invariants:
 *   1. No other module (repairs, jobs, procurement) may call
 *      prisma.part.update({ qtyOnHand: ... }) directly.
 *      Every stock mutation MUST go through this service so that
 *      Part.qtyOnHand, PartLocationStock, and PartStockTransaction
 *      remain consistent at all times.
 *
 *   2. PartLocationStock is the authoritative per-location balance.
 *      It tracks qtyOnHand and qtyReserved at the (part, location) level.
 *      qtyAvailable at a location = qtyOnHand - qtyReserved.
 *
 *   3. Part.qtyOnHand is a denormalised aggregate:
 *        SUM(PartLocationStock.qtyOnHand) WHERE partId = ?
 *      syncPartAggregate() is called inside every mutation transaction
 *      to keep this value current. Never update it directly.
 *
 *   4. Reservations (PartReservation) hold stock logically without removing it
 *      from qtyOnHand. They increment qtyReserved. Consuming a reservation
 *      is when qtyOnHand is actually decremented.
 *
 *   5. Every stock mutation appends a PartStockTransaction record.
 */

import { prisma } from "@/lib/prisma";
import type { PartStockTransaction } from "@prisma/client";

// ── Error class ───────────────────────────────────────────────────────────────

export type InventoryErrorCode =
  | "INSUFFICIENT_STOCK"
  | "PART_NOT_FOUND"
  | "RESERVATION_NOT_FOUND"
  | "ALREADY_CONSUMED"
  | "ALREADY_RELEASED"
  | "INVALID_QUANTITY";

export class InventoryError extends Error {
  constructor(
    message: string,
    public readonly code: InventoryErrorCode,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

// ── Context type ──────────────────────────────────────────────────────────────

type Ctx = {
  orgId: string;
  performedById: string;
  jobId?: string;
  allowNegative?: boolean;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Recomputes Part.qtyOnHand as the sum of all PartLocationStock.qtyOnHand
 * rows for that part. Must be called inside a transaction after every mutation
 * that changes a PartLocationStock.qtyOnHand value.
 */
async function syncPartAggregate(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  partId: string,
): Promise<void> {
  const agg = await tx.partLocationStock.aggregate({
    where: { partId },
    _sum: { qtyOnHand: true },
  });
  const total = agg._sum.qtyOnHand ?? 0;
  await tx.part.update({
    where: { id: partId },
    data: { qtyOnHand: total },
  });
}

/**
 * Asserts the part exists. Returns the part row.
 * Throws PART_NOT_FOUND if absent.
 */
async function requirePart(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  partId: string,
) {
  const part = await tx.part.findUnique({
    where: { id: partId },
    select: { id: true, unitCost: true },
  });
  if (!part) throw new InventoryError(`Part ${partId} not found`, "PART_NOT_FOUND");
  return part;
}

/**
 * Guards against zero or negative quantity inputs before any DB access.
 */
function guardQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InventoryError(
      `Quantity must be a positive integer, got: ${quantity}`,
      "INVALID_QUANTITY",
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record inbound stock (purchase receive, customer return, opening balance).
 * Upserts the PartLocationStock row (incrementing qtyOnHand), creates an IN
 * transaction, and syncs Part.qtyOnHand.
 */
export async function receiveStock(params: {
  partId: string;
  locationId: string;
  quantity: number;
  ctx: Ctx;
}): Promise<void> {
  const { partId, locationId, quantity, ctx } = params;

  guardQuantity(quantity);

  await prisma.$transaction(async (tx) => {
    await requirePart(tx, partId);

    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId,
        locationId,
        qtyOnHand: quantity,
        qtyReserved: 0,
      },
      update: {
        qtyOnHand: { increment: quantity },
      },
    });

    await tx.partStockTransaction.create({
      data: {
        partId,
        type: "IN",
        quantity,
        reason: null,
        jobId: ctx.jobId ?? null,
        createdById: ctx.performedById,
      },
    });

    await syncPartAggregate(tx, partId);
  });
}

/**
 * Deduct stock at a specific location (issue to technician, write-off).
 * Checks qtyAvailable = qtyOnHand - qtyReserved at the location level.
 * Decrements PartLocationStock.qtyOnHand, creates an OUT transaction, and
 * syncs Part.qtyOnHand. Throws INSUFFICIENT_STOCK unless ctx.allowNegative.
 */
export async function issueStock(params: {
  partId: string;
  locationId: string;
  quantity: number;
  ctx: Ctx;
}): Promise<void> {
  const { partId, locationId, quantity, ctx } = params;

  guardQuantity(quantity);

  await prisma.$transaction(async (tx) => {
    await requirePart(tx, partId);

    const locationRow = await tx.partLocationStock.findUnique({
      where: { partId_locationId: { partId, locationId } },
      select: { qtyOnHand: true, qtyReserved: true },
    });

    const qtyOnHand = locationRow?.qtyOnHand ?? 0;
    const qtyReserved = locationRow?.qtyReserved ?? 0;
    const qtyAvailable = qtyOnHand - qtyReserved;

    if (!ctx.allowNegative && qtyAvailable < quantity) {
      throw new InventoryError(
        `Insufficient available stock for part ${partId} at location ${locationId}. ` +
          `Available: ${qtyAvailable}, requested: ${quantity}`,
        "INSUFFICIENT_STOCK",
      );
    }

    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId,
        locationId,
        qtyOnHand: -quantity,
        qtyReserved: 0,
      },
      update: {
        qtyOnHand: { decrement: quantity },
      },
    });

    await tx.partStockTransaction.create({
      data: {
        partId,
        type: "OUT",
        quantity,
        reason: null,
        jobId: ctx.jobId ?? null,
        createdById: ctx.performedById,
      },
    });

    await syncPartAggregate(tx, partId);
  });
}

/**
 * Soft-reserve stock at a specific location for a repair job.
 * Verifies qtyAvailable at the location (qtyOnHand - qtyReserved) is sufficient,
 * creates a PartReservation(RESERVED), and increments PartLocationStock.qtyReserved.
 * Does NOT change qtyOnHand — the item remains physically on the shelf.
 * Returns the new reservation id.
 */
export async function reserveForJob(params: {
  partId: string;
  locationId: string;
  quantity: number;
  jobId: string;
  ctx: Ctx;
}): Promise<string> {
  const { partId, locationId, quantity, jobId, ctx } = params;

  guardQuantity(quantity);

  return prisma.$transaction(async (tx) => {
    const part = await requirePart(tx, partId);

    const locationRow = await tx.partLocationStock.findUnique({
      where: { partId_locationId: { partId, locationId } },
      select: { qtyOnHand: true, qtyReserved: true },
    });

    const qtyOnHand = locationRow?.qtyOnHand ?? 0;
    const qtyReserved = locationRow?.qtyReserved ?? 0;
    const qtyAvailable = qtyOnHand - qtyReserved;

    if (qtyAvailable < quantity) {
      throw new InventoryError(
        `Cannot reserve ${quantity} of part ${partId} at location ${locationId} — ` +
          `only ${qtyAvailable} available`,
        "INSUFFICIENT_STOCK",
      );
    }

    const reservation = await tx.partReservation.create({
      data: {
        partId,
        jobId,
        quantity,
        status: "RESERVED",
        reservedById: ctx.performedById,
        unitCostSnapshot: part.unitCost ?? null,
      },
    });

    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId,
        locationId,
        qtyOnHand: 0,
        qtyReserved: quantity,
      },
      update: {
        qtyReserved: { increment: quantity },
      },
    });

    // qtyOnHand is unchanged — no syncPartAggregate needed
    return reservation.id;
  });
}

/**
 * Mark a reservation as consumed — the part has been physically used in a repair.
 * Transitions RESERVED → CONSUMED, decrements PartLocationStock.qtyOnHand AND
 * qtyReserved by reservation.quantity, creates an OUT transaction, and syncs
 * Part.qtyOnHand.
 * If the PartLocationStock row is missing it is treated as zeros (safe upsert).
 */
export async function consumeReservation(params: {
  reservationId: string;
  locationId: string;
  ctx: Ctx;
}): Promise<void> {
  const { reservationId, locationId, ctx } = params;

  await prisma.$transaction(async (tx) => {
    const reservation = await tx.partReservation.findUnique({
      where: { id: reservationId },
      select: { id: true, partId: true, quantity: true, status: true, jobId: true },
    });

    if (!reservation) {
      throw new InventoryError(
        `Reservation ${reservationId} not found`,
        "RESERVATION_NOT_FOUND",
      );
    }
    if (reservation.status === "CONSUMED") {
      throw new InventoryError(
        `Reservation ${reservationId} is already consumed`,
        "ALREADY_CONSUMED",
      );
    }
    if (reservation.status === "RELEASED") {
      throw new InventoryError(
        `Reservation ${reservationId} was already released`,
        "ALREADY_RELEASED",
      );
    }

    await tx.partReservation.update({
      where: { id: reservationId },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });

    // Decrement both qtyOnHand and qtyReserved. Upsert handles missing row as zeros.
    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId: reservation.partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId: reservation.partId,
        locationId,
        qtyOnHand: -reservation.quantity,
        qtyReserved: -reservation.quantity,
      },
      update: {
        qtyOnHand: { decrement: reservation.quantity },
        qtyReserved: { decrement: reservation.quantity },
      },
    });

    await tx.partStockTransaction.create({
      data: {
        partId: reservation.partId,
        type: "OUT",
        quantity: reservation.quantity,
        reason: "REPAIR_CONSUME",
        jobId: ctx.jobId ?? reservation.jobId,
        createdById: ctx.performedById,
      },
    });

    await syncPartAggregate(tx, reservation.partId);
  });
}

/**
 * Release an unused reservation — the part was not needed.
 * Transitions RESERVED → RELEASED, decrements PartLocationStock.qtyReserved only.
 * qtyOnHand is NOT changed because it was never decremented at reservation time.
 * If the PartLocationStock row is missing it is treated as zeros (safe upsert).
 */
export async function releaseReservation(params: {
  reservationId: string;
  locationId: string;
  ctx: Ctx;
}): Promise<void> {
  const { reservationId, locationId, ctx } = params;

  await prisma.$transaction(async (tx) => {
    const reservation = await tx.partReservation.findUnique({
      where: { id: reservationId },
      select: { id: true, partId: true, quantity: true, status: true },
    });

    if (!reservation) {
      throw new InventoryError(
        `Reservation ${reservationId} not found`,
        "RESERVATION_NOT_FOUND",
      );
    }
    if (reservation.status === "CONSUMED") {
      throw new InventoryError(
        `Reservation ${reservationId} is already consumed`,
        "ALREADY_CONSUMED",
      );
    }
    if (reservation.status === "RELEASED") {
      throw new InventoryError(
        `Reservation ${reservationId} is already released`,
        "ALREADY_RELEASED",
      );
    }

    await tx.partReservation.update({
      where: { id: reservationId },
      data: { status: "RELEASED", releasedAt: new Date() },
    });

    // Only qtyReserved changes. Upsert handles missing row as zeros.
    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId: reservation.partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId: reservation.partId,
        locationId,
        qtyOnHand: 0,
        qtyReserved: -reservation.quantity,
      },
      update: {
        qtyReserved: { decrement: reservation.quantity },
      },
    });

    // qtyOnHand unchanged — no syncPartAggregate needed
  });
}

/**
 * Apply a stock adjustment from a physical count or manual correction.
 * variance = countedQuantity - systemQuantity
 * Updates PartLocationStock.qtyOnHand by variance, creates an ADJUST transaction,
 * and syncs Part.qtyOnHand. No-ops when variance is zero.
 * Throws INSUFFICIENT_STOCK if the resulting qtyOnHand would be negative,
 * unless ctx.allowNegative is true.
 */
export async function applyAdjustment(params: {
  partId: string;
  locationId: string;
  systemQuantity: number;
  countedQuantity: number;
  ctx: Ctx;
}): Promise<void> {
  const { partId, locationId, systemQuantity, countedQuantity, ctx } = params;

  if (countedQuantity < 0) {
    throw new InventoryError(
      `countedQuantity must be >= 0, got: ${countedQuantity}`,
      "INVALID_QUANTITY",
    );
  }

  const variance = countedQuantity - systemQuantity;
  if (variance === 0) return;

  await prisma.$transaction(async (tx) => {
    await requirePart(tx, partId);

    const locationRow = await tx.partLocationStock.findUnique({
      where: { partId_locationId: { partId, locationId } },
      select: { qtyOnHand: true },
    });

    const currentQty = locationRow?.qtyOnHand ?? 0;
    const resultingQty = currentQty + variance;

    if (!ctx.allowNegative && resultingQty < 0) {
      throw new InventoryError(
        `Adjustment would set qtyOnHand to ${resultingQty} for part ${partId} ` +
          `at location ${locationId}`,
        "INSUFFICIENT_STOCK",
      );
    }

    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId, locationId } },
      create: {
        orgId: ctx.orgId,
        partId,
        locationId,
        qtyOnHand: variance,
        qtyReserved: 0,
      },
      update: {
        qtyOnHand: { increment: variance },
      },
    });

    await tx.partStockTransaction.create({
      data: {
        partId,
        type: "ADJUST",
        quantity: variance,
        reason: `STOCK_COUNT: system=${systemQuantity} counted=${countedQuantity}`,
        jobId: ctx.jobId ?? null,
        createdById: ctx.performedById,
      },
    });

    await syncPartAggregate(tx, partId);
  });
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Returns { qtyOnHand, qtyReserved, qtyAvailable } from the PartLocationStock
 * row for the given (partId, locationId) pair. Returns zeros if the row does
 * not yet exist (part has never been stocked at this location).
 */
export async function getLocationBalance(
  partId: string,
  locationId: string,
): Promise<{ qtyOnHand: number; qtyReserved: number; qtyAvailable: number }> {
  const row = await prisma.partLocationStock.findUnique({
    where: { partId_locationId: { partId, locationId } },
    select: { qtyOnHand: true, qtyReserved: true },
  });

  const qtyOnHand = row?.qtyOnHand ?? 0;
  const qtyReserved = row?.qtyReserved ?? 0;
  const qtyAvailable = Math.max(0, qtyOnHand - qtyReserved);

  return { qtyOnHand, qtyReserved, qtyAvailable };
}

/**
 * Convenience wrapper — returns only qtyAvailable (qtyOnHand - qtyReserved)
 * at the given location.
 */
export async function getAvailableQty(partId: string, locationId: string): Promise<number> {
  const { qtyAvailable } = await getLocationBalance(partId, locationId);
  return qtyAvailable;
}

/**
 * Returns PartStockTransaction records for a part, newest first.
 */
export async function getMovementHistory(
  partId: string,
  limit = 100,
): Promise<PartStockTransaction[]> {
  return prisma.partStockTransaction.findMany({
    where: { partId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
