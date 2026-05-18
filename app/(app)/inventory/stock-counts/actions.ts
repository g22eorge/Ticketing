"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";

async function requireInventoryManager() {
  const ctx = await requireOrgSession();
  if (!can.manageInventory(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, userAccessMode: ctx.user.accessMode, kind: "GENERAL" });
  return ctx;
}

async function generateCountNumber(orgId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.stockCount.count({ where: { orgId } });
  return `SC-${year}-${String(count + 1).padStart(4, "0")}`;
}

type CountLine = { partId: string; systemQty: number; countedQty: number; note?: string };

function parseLines(raw: FormDataEntryValue | null): CountLine[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as CountLine[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map((line) => ({
      partId: String(line.partId ?? "").trim(),
      systemQty: Math.floor(Number(line.systemQty)),
      countedQty: Math.max(0, Math.floor(Number(line.countedQty))),
      note: String(line.note ?? "").trim() || undefined,
    }));
  } catch {
    return null;
  }
}

export async function createStockCountAction(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { orgId, session } = await requireInventoryManager();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const countedAtRaw = String(formData.get("countedAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const lines = parseLines(formData.get("items"));

  if (!locationId) return { error: "Location is required" };
  if (!lines?.length) return { error: "Add at least one counted item" };
  if (lines.some((line) => !line.partId || line.systemQty < 0 || line.countedQty < 0)) return { error: "Invalid count line" };

  const location = await prisma.stockLocation.findFirst({ where: { id: locationId, orgId, isActive: true }, select: { id: true } });
  if (!location) return { error: "Location not found" };

  const partIds = Array.from(new Set(lines.map((line) => line.partId)));
  const parts = await prisma.part.findMany({ where: { id: { in: partIds }, orgId, isActive: true }, select: { id: true } });
  if (parts.length !== partIds.length) return { error: "One or more parts are invalid" };

  const stockCount = await prisma.stockCount.create({
    data: {
      orgId,
      countNumber: await generateCountNumber(orgId),
      status: "SUBMITTED",
      locationId,
      countedAt: countedAtRaw ? new Date(countedAtRaw) : new Date(),
      submittedAt: new Date(),
      note,
      createdById: session.user.id,
      items: {
        create: lines.map((line) => ({
          partId: line.partId,
          systemQty: line.systemQty,
          countedQty: line.countedQty,
          varianceQty: line.countedQty - line.systemQty,
          note: line.note ?? null,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/inventory/stock-counts");
  return { id: stockCount.id };
}

export async function cancelStockCountAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.stockCount.updateMany({ where: { id, orgId, status: { in: ["DRAFT", "SUBMITTED"] } }, data: { status: "CANCELLED" } });
  revalidatePath("/inventory/stock-counts");
  revalidatePath(`/inventory/stock-counts/${id}`);
}

export async function approveStockCountAction(formData: FormData): Promise<void> {
  const { orgId, session } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findFirst({
      where: { id, orgId, status: "SUBMITTED" },
      include: { items: true },
    });
    if (!count) return;

    for (const item of count.items) {
      if (item.varianceQty === 0) continue;
      const current = await tx.partLocationStock.findUnique({
        where: { partId_locationId: { partId: item.partId, locationId: count.locationId } },
        select: { qtyOnHand: true },
      });
      const currentQty = current?.qtyOnHand ?? 0;
      const nextQty = currentQty + item.varianceQty;
      if (nextQty < 0) throw new Error("Stock count approval would create negative stock");

      await tx.partLocationStock.upsert({
        where: { partId_locationId: { partId: item.partId, locationId: count.locationId } },
        create: { orgId, partId: item.partId, locationId: count.locationId, qtyOnHand: item.varianceQty, qtyReserved: 0 },
        update: { qtyOnHand: { increment: item.varianceQty } },
      });
      await tx.partStockTransaction.create({
        data: { partId: item.partId, type: "ADJUST", quantity: item.varianceQty, reason: `STOCK_COUNT ${count.countNumber}: system=${item.systemQty} counted=${item.countedQty}`, createdById: session.user.id },
      });
      const aggregate = await tx.partLocationStock.aggregate({ where: { partId: item.partId }, _sum: { qtyOnHand: true } });
      await tx.part.update({ where: { id: item.partId }, data: { qtyOnHand: aggregate._sum.qtyOnHand ?? 0 } });
    }

    await tx.stockCount.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: session.user.id } });
  });

  revalidatePath("/inventory/stock-counts");
  revalidatePath(`/inventory/stock-counts/${id}`);
  revalidatePath("/inventory");
}
