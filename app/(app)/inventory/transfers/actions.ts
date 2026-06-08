"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";
import type { Prisma } from "@prisma/client";
import { notifyStockTransferUpdated } from "@/lib/notifications";

async function requireInventoryManager() {
  const ctx = await requireOrgSession();
  if (!can.manageInventory(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, userAccessMode: ctx.user.accessMode, kind: "GENERAL" });
  return ctx;
}

async function nextTransferNumber(tx: Prisma.TransactionClient, orgId: string) {
  const year = new Date().getFullYear();
  const prefix = `ST-${year}-`;
  const count = await tx.stockTransfer.count({ where: { orgId, transferNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

async function syncPartAggregate(tx: Prisma.TransactionClient, partId: string) {
  const agg = await tx.partLocationStock.aggregate({ where: { partId }, _sum: { qtyOnHand: true } });
  await tx.part.update({ where: { id: partId }, data: { qtyOnHand: agg._sum.qtyOnHand ?? 0 } });
}

async function loadTransfer(tx: Prisma.TransactionClient, id: string, orgId: string) {
  return tx.stockTransfer.findFirst({
    where: { id, orgId },
    include: { items: true },
  });
}

export async function createStockTransferAction(formData: FormData): Promise<void> {
  const { orgId, user } = await requireInventoryManager();
  const fromLocationId = String(formData.get("fromLocationId") ?? "").trim();
  const toLocationId = String(formData.get("toLocationId") ?? "").trim();
  const partId = String(formData.get("partId") ?? "").trim();
  const quantity = Math.floor(Number(String(formData.get("quantity") ?? "0").trim()));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!fromLocationId || !toLocationId || !partId) redirect("/inventory/transfers?error=Complete+all+required+fields");
  if (fromLocationId === toLocationId) redirect("/inventory/transfers?error=Locations+must+be+different");
  if (!Number.isFinite(quantity) || quantity <= 0) redirect("/inventory/transfers?error=Quantity+must+be+positive");

  await prisma.$transaction(async (tx) => {
    const [from, to, part] = await Promise.all([
      tx.stockLocation.findFirst({ where: { id: fromLocationId, orgId, isActive: true }, select: { id: true } }),
      tx.stockLocation.findFirst({ where: { id: toLocationId, orgId, isActive: true }, select: { id: true } }),
      tx.part.findFirst({ where: { id: partId, orgId, isActive: true }, select: { id: true } }),
    ]);
    if (!from || !to || !part) throw new Error("Invalid transfer source, destination, or item");

    await tx.stockTransfer.create({
      data: {
        orgId,
        transferNumber: await nextTransferNumber(tx, orgId),
        fromLocationId,
        toLocationId,
        note,
        createdById: user.id,
        items: { create: { partId, quantity } },
      },
    });
  }).catch(() => redirect("/inventory/transfers?error=Failed+to+create+transfer"));

  revalidatePath("/inventory/transfers");
  redirect("/inventory/transfers?created=1");
}

export async function approveStockTransferAction(formData: FormData) {
  const { orgId, user } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const transfer = await prisma.stockTransfer.findFirst({ where: { id, orgId }, select: { transferNumber: true } });
  await prisma.stockTransfer.updateMany({
    where: { id, orgId, status: "REQUESTED" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id },
  });
  if (transfer) {
    notifyStockTransferUpdated({ orgId, transferNumber: transfer.transferNumber, status: "APPROVED", actorName: user.name ?? user.email ?? "Unknown" }).catch(() => {});
  }
  revalidatePath("/inventory/transfers");
}

export async function cancelStockTransferAction(formData: FormData) {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.stockTransfer.updateMany({
    where: { id, orgId, status: { in: ["REQUESTED", "APPROVED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  revalidatePath("/inventory/transfers");
}

export async function dispatchStockTransferAction(formData: FormData) {
  const { orgId, user } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.$transaction(async (tx) => {
    const transfer = await loadTransfer(tx, id, orgId);
    if (!transfer || transfer.status !== "APPROVED") return;

    for (const item of transfer.items) {
      const row = await tx.partLocationStock.findUnique({
        where: { partId_locationId: { partId: item.partId, locationId: transfer.fromLocationId } },
        select: { qtyOnHand: true, qtyReserved: true },
      });
      const available = (row?.qtyOnHand ?? 0) - (row?.qtyReserved ?? 0);
      if (available < item.quantity) throw new Error("Insufficient stock for transfer");

      await tx.partLocationStock.update({
        where: { partId_locationId: { partId: item.partId, locationId: transfer.fromLocationId } },
        data: { qtyOnHand: { decrement: item.quantity } },
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { qtyDispatched: item.quantity } });
      await tx.partStockTransaction.create({
        data: {
          partId: item.partId,
          type: "OUT",
          quantity: item.quantity,
          reason: `Stock transfer ${transfer.transferNumber} dispatched`,
          createdById: user.id,
        },
      });
      await syncPartAggregate(tx, item.partId);
    }

    await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "DISPATCHED", dispatchedAt: new Date(), dispatchedById: user.id },
    });
  }).catch(() => redirect("/inventory/transfers?error=Insufficient+stock+or+dispatch+failed"));

  const dispatched = await prisma.stockTransfer.findFirst({ where: { id, orgId }, select: { transferNumber: true } });
  if (dispatched) {
    notifyStockTransferUpdated({ orgId, transferNumber: dispatched.transferNumber, status: "DISPATCHED", actorName: user.name ?? user.email ?? "Unknown" }).catch(() => {});
  }
  revalidatePath("/inventory/transfers");
}

export async function receiveStockTransferAction(formData: FormData) {
  const { orgId, user } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.$transaction(async (tx) => {
    const transfer = await loadTransfer(tx, id, orgId);
    if (!transfer || transfer.status !== "DISPATCHED") return;

    for (const item of transfer.items) {
      const receiveQty = item.qtyDispatched || item.quantity;
      await tx.partLocationStock.upsert({
        where: { partId_locationId: { partId: item.partId, locationId: transfer.toLocationId } },
        create: { orgId, partId: item.partId, locationId: transfer.toLocationId, qtyOnHand: receiveQty, qtyReserved: 0 },
        update: { qtyOnHand: { increment: receiveQty } },
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { qtyReceived: receiveQty } });
      await tx.partStockTransaction.create({
        data: {
          partId: item.partId,
          type: "IN",
          quantity: receiveQty,
          reason: `Stock transfer ${transfer.transferNumber} received`,
          createdById: user.id,
        },
      });
      await syncPartAggregate(tx, item.partId);
    }

    await tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "RECEIVED", receivedAt: new Date(), receivedById: user.id },
    });
  });

  const received = await prisma.stockTransfer.findFirst({ where: { id, orgId }, select: { transferNumber: true } });
  if (received) {
    notifyStockTransferUpdated({ orgId, transferNumber: received.transferNumber, status: "RECEIVED", actorName: user.name ?? user.email ?? "Unknown" }).catch(() => {});
  }
  revalidatePath("/inventory/transfers");
}
