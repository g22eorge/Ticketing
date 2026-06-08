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

async function generateBillNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.supplierBill.count({ where: { orgId } });
  return `SB-${year}-${String(count + 1).padStart(4, "0")}`;
}

type BillLine = { description: string; quantity: number; unitCost: number };

function parseLines(raw: FormDataEntryValue | null): BillLine[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as BillLine[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map((line) => ({
      description: String(line.description ?? "").trim(),
      quantity: Math.max(0, Math.floor(Number(line.quantity))),
      unitCost: Number(line.unitCost),
    }));
  } catch {
    return null;
  }
}

export async function createSupplierBillAction(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { orgId, session, org } = await requireInventoryManager();

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  const poId = String(formData.get("poId") ?? "").trim() || null;
  const grnId = String(formData.get("grnId") ?? "").trim() || null;
  const supplierRef = String(formData.get("supplierRef") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? org.baseCurrency).trim().toUpperCase() || org.baseCurrency;
  const taxAmount = Math.max(0, Number(String(formData.get("taxAmount") ?? "0").trim()) || 0);
  const issuedAtRaw = String(formData.get("issuedAt") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const lines = parseLines(formData.get("items"));

  if (!supplierId) return { error: "Supplier is required" };
  if (!lines?.length) return { error: "Add at least one bill line" };
  if (lines.some((line) => !line.description || line.quantity < 1 || !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
    return { error: "Every bill line needs a description, positive quantity, and valid unit cost" };
  }

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, orgId }, select: { id: true } });
  if (!supplier) return { error: "Supplier not found" };

  if (poId) {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, orgId, supplierId }, select: { id: true } });
    if (!po) return { error: "Purchase order not found for this supplier" };
  }
  if (grnId) {
    const grn = await prisma.goodsReceived.findFirst({ where: { id: grnId, orgId, supplierId }, select: { id: true, poId: true } });
    if (!grn) return { error: "Goods received note not found for this supplier" };
    if (poId && grn.poId && grn.poId !== poId) return { error: "GRN does not belong to the selected purchase order" };
  }

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const totalAmount = subtotal + taxAmount;
  const billNumber = await generateBillNumber(orgId);

  const bill = await prisma.supplierBill.create({
    data: {
      orgId,
      billNumber,
      supplierRef,
      supplierId,
      poId,
      grnId,
      currency,
      subtotal,
      taxAmount,
      totalAmount,
      issuedAt: issuedAtRaw ? new Date(issuedAtRaw) : new Date(),
      dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
      notes,
      createdById: session.user.id,
      items: {
        create: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.quantity * line.unitCost,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/inventory/supplier-bills");
  revalidatePath("/procurement");
  revalidatePath(`/inventory/suppliers/${supplierId}`);
  return { id: bill.id };
}

export async function cancelSupplierBillAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.supplierBill.updateMany({
    where: { id, orgId, paidAmount: 0 },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/inventory/supplier-bills");
  revalidatePath("/procurement");
  revalidatePath(`/inventory/supplier-bills/${id}`);
}

function nextBillStatus(totalAmount: number, paidAmount: number) {
  if (paidAmount <= 0) return "POSTED" as const;
  if (paidAmount >= totalAmount) return "PAID" as const;
  return "PART_PAID" as const;
}

export async function createSupplierPaymentAction(formData: FormData): Promise<void> {
  const { orgId, session, org } = await requireInventoryManager();
  const billId = String(formData.get("billId") ?? "").trim();
  const amount = Number(String(formData.get("amount") ?? "0").trim());
  const method = String(formData.get("method") ?? "CASH").trim().toUpperCase();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!billId || !Number.isFinite(amount) || amount <= 0) return;

  await prisma.$transaction(async (tx) => {
    const bill = await tx.supplierBill.findFirst({
      where: { id: billId, orgId, status: { not: "CANCELLED" } },
      select: { id: true, totalAmount: true, paidAmount: true, currency: true },
    });
    if (!bill) return;

    const balance = bill.totalAmount - bill.paidAmount;
    if (amount > balance) return;

    const nextPaid = bill.paidAmount + amount;
    await tx.supplierPayment.create({
      data: {
        orgId,
        billId,
        currency: bill.currency || org.baseCurrency,
        amount,
        method: method as never,
        reference,
        paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
        note,
        createdById: session.user.id,
      },
    });
    await tx.supplierBill.update({
      where: { id: billId },
      data: {
        paidAmount: nextPaid,
        status: nextBillStatus(bill.totalAmount, nextPaid),
      },
    });
  });

  revalidatePath("/inventory/supplier-bills");
  revalidatePath("/procurement");
  revalidatePath(`/inventory/supplier-bills/${billId}`);
}

export async function deleteSupplierPaymentAction(formData: FormData): Promise<void> {
  const { orgId } = await requireInventoryManager();
  const id = String(formData.get("id") ?? "").trim();
  const billId = String(formData.get("billId") ?? "").trim();
  if (!id || !billId) return;

  await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findFirst({ where: { id, orgId, billId }, select: { id: true, amount: true } });
    if (!payment) return;

    const bill = await tx.supplierBill.findFirst({ where: { id: billId, orgId }, select: { id: true, totalAmount: true, paidAmount: true, status: true } });
    if (!bill || bill.status === "CANCELLED") return;

    await tx.supplierPayment.delete({ where: { id: payment.id } });
    const nextPaid = Math.max(0, bill.paidAmount - payment.amount);
    await tx.supplierBill.update({
      where: { id: billId },
      data: {
        paidAmount: nextPaid,
        status: nextBillStatus(bill.totalAmount, nextPaid),
      },
    });
  });

  revalidatePath("/inventory/supplier-bills");
  revalidatePath("/procurement");
  revalidatePath(`/inventory/supplier-bills/${billId}`);
}
