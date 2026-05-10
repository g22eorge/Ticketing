"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { assertOrgCanMutate } from "@/lib/org-write";

async function requireAdmin() {
  const ctx = await requireOrgSession();
  if (!can.manageUsers(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, kind: "GENERAL" });
  return ctx;
}

// ── Create PO ──────────────────────────────────────────────────────────────

export async function createPurchaseOrderAction(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  const { orgId } = await requireAdmin();

  const supplierId = formData.get("supplierId") as string;
  if (!supplierId) return { error: "Supplier is required" };

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { orgId: true },
  });
  if (!supplier || supplier.orgId !== orgId) return { error: "Supplier not found" };

  const reference = (formData.get("reference") as string).trim() || null;
  const orderedAtRaw = formData.get("orderedAt") as string;
  const expectedAtRaw = formData.get("expectedAt") as string;
  const notes = (formData.get("notes") as string).trim() || null;

  // items encoded as JSON array of { description, qtyOrdered, unitCost, partId? }
  let items: Array<{ description: string; qtyOrdered: number; unitCost: number; partId?: string }> = [];
  try {
    items = JSON.parse(formData.get("items") as string);
  } catch {
    return { error: "Invalid items data" };
  }

  if (!items.length) return { error: "Add at least one item" };
  for (const item of items) {
    if (!item.description?.trim()) return { error: "All items need a description" };
    if (item.qtyOrdered < 1) return { error: "Quantity must be at least 1" };
    if (item.unitCost < 0) return { error: "Unit cost cannot be negative" };
  }

  try {
    const po = await prisma.purchaseOrder.create({
      data: {
        orgId,
        supplierId,
        reference,
        orderedAt: orderedAtRaw ? new Date(orderedAtRaw) : null,
        expectedAt: expectedAtRaw ? new Date(expectedAtRaw) : null,
        notes,
        items: {
          create: items.map((item) => ({
            description: item.description.trim(),
            qtyOrdered: item.qtyOrdered,
            unitCost: item.unitCost,
            partId: item.partId || null,
          })),
        },
      },
    });
    return { id: po.id };
  } catch {
    return { error: "Failed to create purchase order" };
  }
}

// ── Update PO status / meta ────────────────────────────────────────────────

export async function updatePurchaseOrderAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin();

  const id = formData.get("id") as string;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { orgId: true } });
  if (!po || po.orgId !== orgId) return { error: "Not found" };

  const status = formData.get("status") as string;
  const reference = (formData.get("reference") as string).trim() || null;
  const orderedAtRaw = formData.get("orderedAt") as string;
  const expectedAtRaw = formData.get("expectedAt") as string;
  const notes = (formData.get("notes") as string).trim() || null;

  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: status as never,
      reference,
      orderedAt: orderedAtRaw ? new Date(orderedAtRaw) : null,
      expectedAt: expectedAtRaw ? new Date(expectedAtRaw) : null,
      notes,
    },
  });

  revalidatePath(`/inventory/purchase-orders/${id}`);
  return {};
}

// ── Receive stock (mark items received, update Part qty) ───────────────────

export async function receiveStockAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin();

  const poId = formData.get("poId") as string;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: { include: { part: true } } },
  });
  if (!po || po.orgId !== orgId) return { error: "Not found" };

  // qtyReceived_<itemId> fields in formData
  const updates: Array<{ id: string; qtyReceived: number; partId: string | null; delta: number }> = [];

  for (const item of po.items) {
    const val = parseInt(formData.get(`qtyReceived_${item.id}`) as string, 10);
    if (isNaN(val) || val < 0) continue;
    const delta = val - item.qtyReceived;
    if (delta === 0) continue;
    updates.push({ id: item.id, qtyReceived: val, partId: item.partId, delta });
  }

  if (!updates.length) return { error: "No changes to save" };

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.purchaseOrderItem.update({
        where: { id: u.id },
        data: { qtyReceived: u.qtyReceived },
      });
      if (u.partId && u.delta > 0) {
        await tx.part.update({
          where: { id: u.partId },
          data: { qtyOnHand: { increment: u.delta } },
        });
      }
    }

    // determine new PO status
    const allItems = await tx.purchaseOrderItem.findMany({ where: { poId } });
    const allReceived = allItems.every((i) => i.qtyReceived >= i.qtyOrdered);
    const anyReceived = allItems.some((i) => i.qtyReceived > 0);
    const newStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : "ORDERED";

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newStatus as never,
        receivedAt: allReceived ? new Date() : po.receivedAt,
      },
    });
  });

  revalidatePath(`/inventory/purchase-orders/${poId}`);
  return {};
}
