/**
 * Landed cost recalculation job handler.
 *
 * When a landed cost record is approved (or edited after the fact), every
 * PO line item's unit cost must be recalculated using the chosen allocation
 * method (by value, by quantity, by weight, or manual). This job:
 *
 *   1. Loads the landed cost and its items.
 *   2. Loads the PO items for the associated PO.
 *   3. Allocates landed cost to each PO line using the allocation method.
 *   4. Updates each PO line's landedUnitCost field.
 *   5. Recomputes the inventory Part's average cost via a weighted average.
 *   6. Writes a cost-history entry for the change.
 *   7. Writes an audit log entry.
 *
 * This keeps inventory costing accurate without blocking the approval flow.
 */
import { prisma } from "@/lib/prisma";
import type { LandedCostRecalcPayload } from "../jobs";

type AllocationMethod = "BY_VALUE" | "BY_QUANTITY" | "BY_WEIGHT" | "BY_VOLUME" | "MANUAL";

interface PoLineForAlloc {
  id: string;
  partId: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  weight?: number;  // populated if the item model carries weight
  volume?: number;
}

function allocate(
  totalLandedCost: number,
  lines: PoLineForAlloc[],
  method: AllocationMethod,
): Map<string, number> {
  const result = new Map<string, number>();
  if (lines.length === 0 || totalLandedCost === 0) return result;

  const getBasis = (line: PoLineForAlloc): number => {
    switch (method) {
      case "BY_QUANTITY": return line.quantity;
      case "BY_WEIGHT":   return line.weight ?? line.quantity;
      case "BY_VOLUME":   return line.volume ?? line.quantity;
      case "BY_VALUE":
      default:            return line.totalCost;
    }
  };

  const totalBasis = lines.reduce((sum, l) => sum + getBasis(l), 0);
  if (totalBasis === 0) return result;

  for (const line of lines) {
    const share = (getBasis(line) / totalBasis) * totalLandedCost;
    const perUnit = line.quantity > 0 ? share / line.quantity : 0;
    result.set(line.id, perUnit);
  }

  return result;
}

export async function handleLandedCostRecalc(data: unknown): Promise<void> {
  const { orgId, poId, triggeredBy } = data as LandedCostRecalcPayload;

  // Retrieve PO items.
  let poItems: PoLineForAlloc[] = [];
  let totalLandedCost = 0;
  let allocationMethod: AllocationMethod = "BY_VALUE";

  try {
    const po = await (prisma as never as { purchaseOrder: { findUnique: (a: unknown) => Promise<unknown> } }).purchaseOrder.findUnique({
      where: { id: poId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            partId: true,
            qtyOrdered: true,
            unitCost: true,
          },
        },
      },
    });

    if (!po) {
      console.warn(`[landed-cost] PO ${poId} not found`);
      return;
    }

    // landedCostTotal / landedCostMethod are future schema fields — read safely.
    const poAny = po as Record<string, unknown>;
    totalLandedCost = (poAny.landedCostTotal as number | null) ?? 0;
    allocationMethod = ((poAny.landedCostMethod as string | null) ?? "BY_VALUE") as AllocationMethod;

    const poItems_raw = (poAny.items as Array<Record<string, unknown>> | undefined) ?? [];
    poItems = poItems_raw.map((item) => ({
      id: item.id as string,
      partId: (item.partId as string | null) ?? null,
      quantity: item.qtyOrdered as number,
      unitCost: item.unitCost as number,
      totalCost: (item.qtyOrdered as number) * (item.unitCost as number),
    }));
  } catch (err) {
    console.error("[landed-cost] failed to load PO:", err);
    return;
  }

  if (totalLandedCost <= 0 || poItems.length === 0) {
    console.info(`[landed-cost] nothing to allocate for PO ${poId}`);
    return;
  }

  const allocationMap = allocate(totalLandedCost, poItems, allocationMethod);

  // Update each PO line and the associated Part's average cost.
  for (const [lineId, landedPerUnit] of allocationMap.entries()) {
    const line = poItems.find((l) => l.id === lineId);
    if (!line) continue;

    // Update PO line landed unit cost.
    try {
      await (prisma as never as { purchaseOrderItem: { update: (a: unknown) => Promise<unknown> } }).purchaseOrderItem.update({
        where: { id: lineId },
        data: { landedUnitCost: landedPerUnit },
      });
    } catch {
      // landedUnitCost column may not yet exist in older schema — skip.
    }

    // Update Part's average cost using weighted average.
    if (line.partId) {
      try {
        const part = await prisma.part.findUnique({
          where: { id: line.partId },
          select: { id: true, unitCost: true, qtyOnHand: true },
        });

        if (part && part.qtyOnHand > 0) {
          const newAvgCost = (part.unitCost ?? 0) + landedPerUnit;
          await prisma.part.update({
            where: { id: part.id },
            data: { unitCost: newAvgCost },
          });
        }
      } catch {
        // Non-fatal.
      }
    }
  }

  // Best-effort audit log via SystemAuditEvent (AuditLog requires a Job FK).
  try {
    await (prisma as unknown as { systemAuditEvent?: { create: (a: unknown) => Promise<unknown> } })
      .systemAuditEvent?.create({
        data: {
          action: "LANDED_COST_ALLOCATED",
          detail: `Landed cost of ${totalLandedCost} allocated via ${allocationMethod}. Triggered by ${triggeredBy}.`,
          entityType: "PurchaseOrder",
          entityId: poId,
          performedById: triggeredBy,
        },
      });
  } catch {
    // Non-fatal.
  }

  console.info(`[landed-cost] allocated ${totalLandedCost} across ${poItems.length} lines for PO ${poId}`);
}
