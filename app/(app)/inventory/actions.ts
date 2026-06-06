"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { checkPartLimit } from "@/lib/plan-limits";
import { notifyStockAlert } from "@/lib/notifications";

type StockTxnType = "IN" | "OUT" | "ADJUST";

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
  if (!(["IN", "OUT", "ADJUST"] as const).includes(type))
    redirect(`/inventory/${partId}?error=Invalid+stock+action`);

  // ADJUST supports a "correctTo" (set exact count) instead of a delta.
  const correctToRaw = String(formData.get("correctTo") ?? "").trim();
  const isCorrection = type === "ADJUST" && correctToRaw !== "";
  const correctTo = isCorrection ? Math.floor(Number(correctToRaw)) : null;

  if (isCorrection) {
    if (!Number.isFinite(correctTo!) || correctTo! < 0)
      redirect(`/inventory/${partId}?error=Enter+a+valid+target+quantity+%280+or+more%29`);
  } else {
    if (!Number.isFinite(qty) || qty === 0)
      redirect(`/inventory/${partId}?error=Enter+a+non-zero+quantity`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const part = await tx.part.findFirst({
        where: { id: partId, orgId },
        select: { id: true, qtyOnHand: true },
      });
      if (!part) throw new Error("Part not found");

      let delta: number;
      let logQty: number;
      let logReason: string | null;

      if (isCorrection) {
        delta = correctTo! - part.qtyOnHand;
        logQty = Math.abs(delta);
        logReason = reason || `Qty correction: ${part.qtyOnHand} → ${correctTo}`;
        if (delta === 0) redirect(`/inventory/${partId}?error=Quantity+is+already+${correctTo}`);
      } else {
        delta = type === "IN" ? Math.abs(qty) : type === "OUT" ? -Math.abs(qty) : qty;
        logQty = Math.abs(qty);
        logReason = reason || null;
        const nextQty = part.qtyOnHand + delta;
        if (nextQty < 0)
          throw new Error(`Cannot remove ${Math.abs(qty)} — only ${part.qtyOnHand} on hand`);
      }

      await tx.part.update({
        where: { id: part.id },
        data: { qtyOnHand: { increment: delta } },
      });
      await tx.partStockTransaction.create({
        data: {
          partId: part.id,
          type,
          quantity: logQty,
          reason: logReason,
          createdById: session.user.id,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to adjust stock";
    redirect(`/inventory/${partId}?error=${encodeURIComponent(message)}`);
  }

  // Fire stock alert (out-of-stock or low-stock) if threshold crossed.
  // Runs after the transaction — non-blocking, failures don't affect the user action.
  try {
    const updated = await prisma.part.findFirst({
      where: { id: partId, orgId },
      select: { name: true, qtyOnHand: true, reorderLevel: true },
    });
    if (updated) {
      await notifyStockAlert({
        orgId,
        partId,
        partName: updated.name,
        qtyOnHand: updated.qtyOnHand,
        reorderLevel: updated.reorderLevel,
        actorName: user.name ?? user.email ?? "Unknown",
      });
    }
  } catch {
    // Notification failure must never block the stock action
  }

  revalidatePath(`/inventory/${partId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${partId}?saved=1`);
}

export async function togglePartActiveAction(formData: FormData) {
  const { user, orgId } = await requireOrgSession();
  if (!can.manageInventory(user)) redirect("/dashboard");

  const partId = String(formData.get("partId") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();
  if (!partId) redirect("/inventory?error=Part+is+required");

  await prisma.part.updateMany({ where: { id: partId, orgId }, data: { isActive: next === "1" } });
  revalidatePath(`/inventory/${partId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${partId}`);
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
  if (!partId || !sku || !name) redirect(`/inventory/${partId}?error=SKU+and+name+are+required`);

  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;
  const reorderLevel = reorderRaw ? Math.max(0, Math.floor(Number(reorderRaw))) : 0;
  const conflictingSku = await prisma.part.findFirst({
    where: { orgId, sku, id: { not: partId } },
    select: { id: true },
  });
  if (conflictingSku) redirect(`/inventory/${partId}?error=${encodeURIComponent("Another part already uses that SKU")}`);

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
    redirect(`/inventory/${partId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/inventory/${partId}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${partId}`);
}
