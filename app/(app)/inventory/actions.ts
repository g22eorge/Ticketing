"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { checkPartLimit } from "@/lib/plan-limits";

type StockTxnType = "IN" | "OUT" | "ADJUST";
type Tx = Prisma.TransactionClient;

async function getDefaultStockLocation(tx: Tx, orgId: string) {
  return tx.stockLocation.upsert({
    where: { orgId_code: { orgId, code: "MAIN" } },
    create: { orgId, code: "MAIN", name: "Main Stock", isActive: true },
    update: { isActive: true },
    select: { id: true },
  });
}

async function syncPartAggregate(tx: Tx, partId: string) {
  const aggregate = await tx.partLocationStock.aggregate({
    where: { partId },
    _sum: { qtyOnHand: true },
  });
  await tx.part.update({
    where: { id: partId },
    data: { qtyOnHand: aggregate._sum.qtyOnHand ?? 0 },
  });
}

async function prepareManualStockAdjustment(tx: Tx, orgId: string, partId: string, aggregateQty: number) {
  const location = await getDefaultStockLocation(tx, orgId);
  const locationRows = await tx.partLocationStock.count({ where: { partId } });

  if (locationRows === 0 && aggregateQty !== 0) {
    await tx.partLocationStock.create({
      data: {
        orgId,
        partId,
        locationId: location.id,
        qtyOnHand: aggregateQty,
        qtyReserved: 0,
      },
    });
  }

  return location.id;
}

export async function createPartAction(formData: FormData) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/dashboard");

  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const manufacturer = String(formData.get("manufacturer") ?? "").trim();
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const reorderRaw = String(formData.get("reorderLevel") ?? "").trim();

  if (!sku || !name) redirect("/inventory?add=1&error=SKU+and+name+are+required#add-part");

  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
  const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;
  const existing = await prisma.part.findFirst({
    where: { orgId, sku },
    select: { id: true, isActive: true },
  });

  if (existing?.isActive) {
    redirect(`/inventory?add=1&error=${encodeURIComponent("SKU already exists")}#add-part`);
  }

  if (!existing) {
    const partLimit = await checkPartLimit(orgId);
    if (!partLimit.allowed) {
      redirect(`/inventory?error=${encodeURIComponent(partLimit.reason)}`);
    }
  }

  try {
    if (existing) {
      await prisma.part.updateMany({
        where: { id: existing.id, orgId },
        data: {
          name,
          manufacturer: manufacturer || null,
          unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
          reorderLevel,
          isActive: true,
        },
      });
    } else {
      await prisma.part.create({
        data: {
          orgId,
          sku,
          name,
          manufacturer: manufacturer || null,
          unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
          reorderLevel,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isUnique = message.includes("Unique constraint") || message.includes("P2002") || message.toLowerCase().includes("unique");
    const qs = new URLSearchParams({ error: isUnique ? "SKU already exists" : "Failed to add part" }).toString();
    redirect(`/inventory?${qs}#add-part`);
  }

  revalidatePath("/inventory");
  redirect(existing ? "/inventory?created=1&status=active#add-part" : "/inventory?created=1#add-part");
}

export async function adjustStockAction(formData: FormData) {
  const { session, user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/dashboard");

  const partId = String(formData.get("partId") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim().toUpperCase() as StockTxnType;
  const qty = Math.floor(Number(String(formData.get("quantity") ?? "0").trim()));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!partId) redirect("/inventory?error=Part+is+required");
  if (!(["IN", "OUT", "ADJUST"] as const).includes(type)) redirect("/inventory?error=Invalid+stock+action");
  if (!Number.isFinite(qty) || qty === 0) redirect("/inventory?error=Quantity+must+be+a+non-zero+integer");

  try {
    await prisma.$transaction(async (tx) => {
      const part = await tx.part.findFirst({
        where: { id: partId, orgId },
        select: { id: true, qtyOnHand: true },
      });
      if (!part) throw new Error("Part not found");

      const delta =
        type === "IN" ? Math.abs(qty)
        : type === "OUT" ? -Math.abs(qty)
        : qty;
      const nextQty = part.qtyOnHand + delta;

      if (nextQty < 0) throw new Error("Stock cannot go below zero");

      const locationId = await prepareManualStockAdjustment(tx, orgId, part.id, part.qtyOnHand);
      await tx.partLocationStock.upsert({
        where: { partId_locationId: { partId: part.id, locationId } },
        create: {
          orgId,
          partId: part.id,
          locationId,
          qtyOnHand: delta,
          qtyReserved: 0,
        },
        update: { qtyOnHand: { increment: delta } },
      });
      await tx.partStockTransaction.create({
        data: {
          partId: part.id,
          type,
          quantity: type === "IN" ? Math.abs(qty) : type === "OUT" ? Math.abs(qty) : qty,
          reason: reason || null,
          createdById: session.user.id,
        },
      });
      await syncPartAggregate(tx, part.id);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to adjust stock";
    redirect(`/inventory?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function togglePartActiveAction(formData: FormData) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/dashboard");

  const partId = String(formData.get("partId") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  if (!partId) redirect("/inventory?error=Part+is+required");

  await prisma.part.updateMany({ where: { id: partId, orgId }, data: { isActive: next === "1" } });
  revalidatePath("/inventory");
  redirect(next === "1" ? "/inventory?status=active" : "/inventory?status=inactive");
}

export async function updatePartAction(formData: FormData) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/dashboard");

  const partId = String(formData.get("partId") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const manufacturer = String(formData.get("manufacturer") ?? "").trim();
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const reorderRaw = String(formData.get("reorderLevel") ?? "").trim();
  if (!partId || !sku || !name) redirect("/inventory?error=Part%2C+SKU%2C+and+name+are+required");

  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
  const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;
  const conflictingSku = await prisma.part.findFirst({
    where: { orgId, sku, id: { not: partId } },
    select: { id: true },
  });
  if (conflictingSku) redirect(`/inventory?error=${encodeURIComponent("Another part already uses that SKU")}`);

  try {
    const updated = await prisma.part.updateMany({
      where: { id: partId, orgId },
      data: {
        sku,
        name,
        manufacturer: manufacturer || null,
        unitCost: unitCost !== null && Number.isFinite(unitCost) ? unitCost : null,
        reorderLevel,
      },
    });
    if (updated.count !== 1) throw new Error("Part not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update part";
    redirect(`/inventory?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/inventory");
  redirect("/inventory");
}
