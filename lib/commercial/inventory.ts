import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

async function getDefaultStockLocation(tx: Tx, orgId: string) {
  return tx.stockLocation.upsert({
    where: { orgId_code: { orgId, code: "MAIN" } },
    create: {
      orgId,
      code: "MAIN",
      name: "Main Stock",
      isActive: true,
    },
    update: { isActive: true },
    select: { id: true },
  });
}

export async function ensureInventoryDefaults({ tx, orgId }: { tx: Tx; orgId: string }) {
  try {
    await tx.inventoryCategory.upsert({
      where: { orgId_name: { orgId, name: "General" } },
      create: { orgId, name: "General", isActive: true },
      update: { isActive: true },
    });
    await getDefaultStockLocation(tx, orgId);
  } catch {
    // Commercial inventory tables are additive; keep legacy inventory working while rolling out.
  }
}

export async function syncDefaultLocationStock({
  tx,
  orgId,
  partId,
  qtyOnHand,
}: {
  tx: Tx;
  orgId: string;
  partId: string;
  qtyOnHand: number;
}) {
  try {
    const location = await getDefaultStockLocation(tx, orgId);
    await tx.partLocationStock.upsert({
      where: { partId_locationId: { partId, locationId: location.id } },
      create: {
        orgId,
        partId,
        locationId: location.id,
        qtyOnHand,
      },
      update: { qtyOnHand },
    });
  } catch {
    // Location stock is a mirror for now; do not block source-of-truth Part updates.
  }
}

export async function upsertReorderRule({
  tx,
  orgId,
  partId,
  minQty,
  preferredSupplierId = null,
}: {
  tx: Tx;
  orgId: string;
  partId: string;
  minQty: number;
  preferredSupplierId?: string | null;
}) {
  try {
    if (minQty <= 0) return;
    const existing = await tx.reorderRule.findFirst({
      where: { orgId, partId, locationId: null },
      select: { id: true },
    });

    if (existing) {
      await tx.reorderRule.updateMany({
        where: { id: existing.id, orgId },
        data: {
          minQty,
          targetQty: minQty * 2,
          preferredSupplierId,
          isActive: true,
        },
      });
      return;
    }

    await tx.reorderRule.create({
      data: {
        orgId,
        partId,
        locationId: null,
        minQty,
        targetQty: minQty * 2,
        preferredSupplierId,
        isActive: true,
      },
    });
  } catch {
    // Reorder rules are advisory during rollout.
  }
}

export async function writeSupplierPrices({
  tx,
  orgId,
  supplierId,
  items,
  currency,
}: {
  tx: Tx;
  orgId: string;
  supplierId: string;
  currency: string;
  items: Array<{ partId?: string | null; description: string; unitCost: number }>;
}) {
  try {
    const pricedItems = items.filter((item) => Number.isFinite(item.unitCost) && item.unitCost >= 0);
    if (pricedItems.length === 0) return;

    await tx.supplierPrice.createMany({
      data: pricedItems.map((item) => ({
        orgId,
        supplierId,
        partId: item.partId || null,
        description: item.description,
        unitCost: item.unitCost,
        currency,
      })),
    });
  } catch {
    // Supplier price history is additive; do not block purchase orders.
  }
}
