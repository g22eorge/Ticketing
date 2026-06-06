"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";
import { notifyPurchaseRequest } from "@/lib/notifications";

async function requireInventoryManager() {
  const ctx = await requireOrgSession();
  if (!can.manageInventory(ctx.user)) redirect("/inventory");
  assertOrgCanMutate({ access: ctx.org.access, userRole: ctx.user.role, userAccessMode: ctx.user.accessMode, kind: "GENERAL" });
  return ctx;
}

async function generateRequestNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.purchaseRequest.count({ where: { orgId } });
  return `PR-${year}-${String(count + 1).padStart(4, "0")}`;
}

type RequestLine = { description: string; quantity: number; estimatedUnitCost?: number | null; partId?: string | null };

function parseLines(raw: FormDataEntryValue | null): RequestLine[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as RequestLine[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map((line) => ({
      description: String(line.description ?? "").trim(),
      quantity: Math.max(0, Math.floor(Number(line.quantity))),
      estimatedUnitCost: line.estimatedUnitCost === null || line.estimatedUnitCost === undefined ? null : Number(line.estimatedUnitCost),
      partId: line.partId ? String(line.partId) : null,
    }));
  } catch {
    return null;
  }
}

export async function createPurchaseRequestAction(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { orgId, session } = await requireInventoryManager();
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "NORMAL").trim().toUpperCase();
  const neededByRaw = String(formData.get("neededBy") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const lines = parseLines(formData.get("items"));

  if (!lines?.length) return { error: "Add at least one requested item" };
  if (lines.some((line) => !line.description || line.quantity < 1 || (line.estimatedUnitCost != null && (!Number.isFinite(line.estimatedUnitCost) || line.estimatedUnitCost < 0)))) {
    return { error: "Every line needs a description, positive quantity, and valid estimated cost" };
  }
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, orgId, isActive: true }, select: { id: true } });
    if (!supplier) return { error: "Supplier not found" };
  }

  const requestNumber = await generateRequestNumber(orgId);
  const request = await prisma.purchaseRequest.create({
    data: {
      orgId,
      requestNumber,
      status: "SUBMITTED",
      priority: priority as never,
      supplierId,
      neededBy: neededByRaw ? new Date(neededByRaw) : null,
      reason,
      notes,
      requestedById: session.user.id,
      items: {
        create: lines.map((line) => ({
          partId: line.partId,
          description: line.description,
          quantity: line.quantity,
          estimatedUnitCost: line.estimatedUnitCost,
        })),
      },
    },
    select: { id: true },
  });

  const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  notifyPurchaseRequest({
    orgId,
    requestNumber,
    status: "SUBMITTED",
    actorName: actor?.name ?? actor?.email ?? "Unknown",
  }).catch(() => {});

  revalidatePath("/inventory/purchase-requests");
  return { id: request.id };
}

export async function reviewPurchaseRequestAction(formData: FormData): Promise<void> {
  const { orgId, session } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;
  if (!id || !["APPROVED", "REJECTED", "CANCELLED"].includes(action)) return;

  const req = await prisma.purchaseRequest.findFirst({
    where: { id, orgId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
    select: { requestNumber: true },
  });

  await prisma.purchaseRequest.updateMany({
    where: { id, orgId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
    data: {
      status: action as never,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote,
    },
  });

  if (action === "APPROVED" && req) {
    const actor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
    notifyPurchaseRequest({
      orgId,
      requestNumber: req.requestNumber,
      status: "APPROVED",
      actorName: actor?.name ?? actor?.email ?? "Unknown",
    }).catch(() => {});
  }

  revalidatePath("/inventory/purchase-requests");
  revalidatePath(`/inventory/purchase-requests/${id}`);
}

export async function convertPurchaseRequestToPoAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const expectedAtRaw = String(formData.get("expectedAt") ?? "").trim();
  if (!id || !supplierId) return;

  const request = await prisma.purchaseRequest.findFirst({
    where: { id, orgId, status: "APPROVED" },
    include: { items: true },
  });
  if (!request) return;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, orgId, isActive: true }, select: { id: true } });
  if (!supplier) return;

  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        orgId,
        supplierId,
        status: "ORDERED",
        reference,
        orderedAt: new Date(),
        expectedAt: expectedAtRaw ? new Date(expectedAtRaw) : null,
        notes: `Converted from ${request.requestNumber}${request.reason ? `: ${request.reason}` : ""}`,
        items: {
          create: request.items.map((item) => ({
            partId: item.partId,
            description: item.description,
            qtyOrdered: item.quantity,
            unitCost: item.estimatedUnitCost ?? 0,
          })),
        },
      },
      select: { id: true },
    });
    await tx.purchaseRequest.update({
      where: { id },
      data: { status: "CONVERTED", supplierId, convertedPoId: created.id, convertedAt: new Date() },
    });
    return created;
  });

  revalidatePath("/inventory/purchase-requests");
  revalidatePath(`/inventory/purchase-requests/${id}`);
  revalidatePath("/inventory/purchase-orders");
  redirect(`/inventory/purchase-orders/${po.id}`);
}
