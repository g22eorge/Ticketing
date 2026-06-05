import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { DeliveryMethod, PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { formatMoney, normalizeCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { assertOrgCanMutate } from "@/lib/org-write";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { nextDocumentNumber } from "@/lib/commercial/document-workflow";

const METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

async function recalcSaleTotals(
  tx: Prisma.TransactionClient,
  saleId: string,
  includeVat: boolean,
  orgId: string,
) {
  const itemsAgg = await tx.saleItem.aggregate({ where: { saleId }, _sum: { lineTotal: true } });
  const subtotal = itemsAgg._sum.lineTotal ?? 0;
  const current = await tx.sale.findUnique({ where: { id: saleId }, select: { discountAmount: true } });
  const discountAmount = Math.max(0, Math.min(current?.discountAmount ?? 0, subtotal));
  const taxable = Math.max(0, subtotal - discountAmount);
  let vatRate = 0;
  if (includeVat) {
    const branding = await tx.documentBrandingSettings.findFirst({ where: { orgId }, select: { vatRatePercent: true } });
    vatRate = Math.max(0, branding?.vatRatePercent ?? 18) / 100;
  }
  const vatAmount = taxable * vatRate;
  const totalAmount = taxable + vatAmount;

  const payAgg = await tx.payment.aggregate({ where: { saleId, orgId }, _sum: { amount: true } });
  const paidAmount = payAgg._sum.amount ?? 0;
  const isPaid = totalAmount > 0 && paidAmount >= totalAmount;

  await tx.sale.update({
    where: { id: saleId },
    data: {
      subtotal,
      discountAmount,
      vatAmount,
      totalAmount,
      paidAmount,
      paidAt: isPaid ? new Date() : null,
      status: isPaid ? "PAID" : "OPEN",
    },
  });
}

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) {
    redirect("/dashboard");
  }

  const { id } = await params;

  let dbNeedsFix = false;
  let sale: {
    id: string;
    saleNumber: string;
    status: string;
    billingMode: "CASH" | "INVOICE";
    invoiceNumber: string | null;
    invoicedAt: Date | null;
    currency: string | null;
    subtotal: number;
    discountAmount: number;
    vatAmount: number;
    totalAmount: number;
    paidAmount: number;
    paidAt: Date | null;
    createdAt: Date;
    notes: string | null;
    branchId: string | null;
    branch: { name: string } | null;
    client: { fullName: string } | null;
    items: Array<{ id: string; partId: string | null; description: string; quantity: number; unitPrice: number; lineTotal: number }>;
    payments: Array<{ id: string; amount: number; method: PaymentMethod; reference: string | null; receivedAt: Date; currency: string | null }>;
    _count: { payments: number; creditNotes: number; refunds: number; deliveryNotes: number };
  } | null = null;

  let creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    currency: string;
    totalAmount: number;
    issuedAt: Date;
    reason: string | null;
    itemsReceivedBackAt: Date | null;
    itemsReceivedBackNote: string | null;
    items: Array<{ id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; partId: string | null }>;
  }> = [];

  let refunds: Array<{
    id: string;
    amount: number;
    currency: string;
    exchangeRateToBase: number | null;
    method: PaymentMethod;
    reference: string | null;
    refundedAt: Date;
    creditNoteId: string | null;
  }> = [];

  let deliveryNotes: Array<{
    id: string;
    deliveryNoteNumber: string;
    deliveredAt: Date;
    deliveryMethod: DeliveryMethod | null;
    deliveredByName: string;
    receivedByName: string;
  }> = [];

  try {
    sale = await prisma.sale.findFirst({
      where: { id, orgId },
      select: {
        id: true,
        saleNumber: true,
        status: true,
        billingMode: true,
        invoiceNumber: true,
        invoicedAt: true,
        currency: true,
        subtotal: true,
        discountAmount: true,
        vatAmount: true,
        totalAmount: true,
        paidAmount: true,
        paidAt: true,
        createdAt: true,
        notes: true,
        branchId: true,
        branch: { select: { name: true } },
        client: { select: { fullName: true } },
        items: { select: { id: true, partId: true, description: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: "asc" } },
        payments: { select: { id: true, amount: true, method: true, reference: true, receivedAt: true, currency: true }, orderBy: { receivedAt: "desc" } },
        _count: { select: { payments: true, creditNotes: true, refunds: true, deliveryNotes: true } },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table") && msg.includes("Sale")) dbNeedsFix = true;
    sale = null;
  }

  if (!sale) {
    if (dbNeedsFix) redirect("/pos"); // schema not yet migrated — redirect to list
    notFound(); // sale doesn't exist in this org
  }

  const saleCurrency = normalizeCurrency(sale.currency, org.baseCurrency);
  const branches = await prisma.branch.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  }).catch(() => []);

  // Credit notes / refunds are optional features; keep page working if tables are missing.
  try {
    creditNotes = await prisma.creditNote.findMany({
      where: { orgId, saleId: sale.id },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        creditNoteNumber: true,
        currency: true,
        totalAmount: true,
        issuedAt: true,
        reason: true,
        itemsReceivedBackAt: true,
        itemsReceivedBackNote: true,
        items: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, partId: true }, orderBy: { createdAt: "asc" } },
      },
    });
  } catch {
    creditNotes = [];
  }

  try {
    refunds = await prisma.refund.findMany({
      where: { orgId, saleId: sale.id },
      orderBy: { refundedAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        exchangeRateToBase: true,
        method: true,
        reference: true,
        refundedAt: true,
        creditNoteId: true,
      },
    });
  } catch {
    refunds = [];
  }

  // Delivery notes are optional; keep page working if table is missing.
  try {
    deliveryNotes = await prisma.deliveryNote.findMany({
      where: { orgId, saleId: sale.id },
      orderBy: { deliveredAt: "desc" },
      select: {
        id: true,
        deliveryNoteNumber: true,
        deliveredAt: true,
        deliveryMethod: true,
        deliveredByName: true,
        receivedByName: true,
      },
    });
  } catch {
    deliveryNotes = [];
  }

  const parts = await prisma.part.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, sku: true, name: true, qtyOnHand: true },
    take: 300,
  }).catch(() => []);

  async function updateSaleAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const branchId = String(formData.get("branchId") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim();
    if (!saleId) return;

    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, orgId, isActive: true }, select: { id: true } });
      if (!branch) return;
    }

    await prisma.sale.updateMany({
      where: { id: saleId, orgId },
      data: { branchId, notes: notes || null },
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Sale", entityId: saleId, action: "POS_SALE_UPDATED", summary: "POS sale metadata updated" });

    revalidatePath(`/pos/${saleId}`);
    revalidatePath("/pos");
  }

  async function deleteSaleAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (user.role !== "ADMIN") redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    if (!saleId) return;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: {
        id: true,
        status: true,
        invoicedAt: true,
        items: { select: { partId: true, quantity: true, description: true } },
        payments: { select: { id: true }, take: 1 },
        creditNotes: { select: { id: true }, take: 1 },
        refunds: { select: { id: true }, take: 1 },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!sale || sale.status !== "OPEN" || sale.invoicedAt || sale.payments.length || sale.creditNotes.length || sale.refunds.length || sale.deliveryNotes.length) return;

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (!item.partId) continue;
        const part = await tx.part.findFirst({ where: { id: item.partId, orgId }, select: { id: true, qtyOnHand: true } });
        if (!part) continue;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(item.quantity) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId: sale.id,
            type: "IN",
            quantity: Math.abs(item.quantity),
            reason: `POS sale deleted (${item.description})`,
            createdById: user.id,
          },
        });
      }
      await tx.sale.deleteMany({ where: { id: sale.id, orgId } });
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Sale", entityId: sale.id, action: "POS_SALE_DELETED", summary: "Open POS sale deleted" });

    revalidatePath("/pos");
    redirect("/pos");
  }

  async function updateItemAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const quantity = Math.max(1, Math.floor(Number(String(formData.get("quantity") ?? "1").trim())));
    const unitPrice = Number(String(formData.get("unitPrice") ?? "0").trim());
    if (!saleId || !itemId || !description || !Number.isFinite(quantity) || !Number.isFinite(unitPrice) || unitPrice < 0) return;

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
      if (!sale || sale.status !== "OPEN") return;

      const item = await tx.saleItem.findFirst({ where: { id: itemId, saleId }, select: { id: true, partId: true, quantity: true } });
      if (!item) return;

      const delta = quantity - item.quantity;
      if (item.partId && delta !== 0) {
        const part = await tx.part.findFirst({ where: { id: item.partId, orgId }, select: { id: true, qtyOnHand: true } });
        if (!part) return;
        const nextQty = part.qtyOnHand - delta;
        if (nextQty < 0) return;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: nextQty } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId,
            type: delta > 0 ? "OUT" : "IN",
            quantity: Math.abs(delta),
            reason: `POS sale item updated (${description})`,
            createdById: user.id,
          },
        });
      }

      await tx.saleItem.update({ where: { id: item.id }, data: { description, quantity, unitPrice, lineTotal: quantity * unitPrice } });
      await recalcSaleTotals(tx, saleId, true, orgId);
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "SaleItem", entityId: itemId, action: "POS_ITEM_UPDATED", summary: "POS sale item updated" });

    revalidatePath(`/pos/${saleId}`);
  }

  async function deleteItemAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim();
    if (!saleId || !itemId) return;

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
      if (!sale || sale.status !== "OPEN") return;

      const item = await tx.saleItem.findFirst({ where: { id: itemId, saleId }, select: { id: true, partId: true, quantity: true, description: true } });
      if (!item) return;

      if (item.partId) {
        const part = await tx.part.findFirst({ where: { id: item.partId, orgId }, select: { id: true, qtyOnHand: true } });
        if (part) {
          await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(item.quantity) } });
          await tx.partStockTransaction.create({
            data: {
              partId: part.id,
              saleId,
              type: "IN",
              quantity: Math.abs(item.quantity),
              reason: `POS sale item deleted (${item.description})`,
              createdById: user.id,
            },
          });
        }
      }

      await tx.saleItem.delete({ where: { id: item.id } });
      await recalcSaleTotals(tx, saleId, true, orgId);
    });
    await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "SaleItem", entityId: itemId, action: "POS_ITEM_DELETED", summary: "POS sale item deleted" });

    revalidatePath(`/pos/${saleId}`);
  }

  async function addItemAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const partId = String(formData.get("partId") ?? "").trim() || null;
    const description = String(formData.get("description") ?? "").trim();
    const qty = Number(String(formData.get("quantity") ?? "1").trim());
    const unitPrice = Number(String(formData.get("unitPrice") ?? "0").trim());
    const vat = String(formData.get("vat") ?? "on") === "on";

    if (!saleId) return;
    if (!partId && !description) return;
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
    if (!existingSale || existingSale.status !== "OPEN") return;

    const lineTotal = unitPrice * qty;

    await prisma.$transaction(async (tx) => {
      let resolvedDescription = description;
      let resolvedPartId: string | null = null;

      if (partId) {
        const part = await tx.part.findFirst({ where: { id: partId, orgId, isActive: true }, select: { id: true, sku: true, name: true, qtyOnHand: true } });
        if (!part) return;
        if (part.qtyOnHand - Math.abs(qty) < 0) return;

        resolvedPartId = part.id;
        resolvedDescription = `${part.sku} ${part.name}`;

        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand - Math.abs(qty) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId,
            type: "OUT",
            quantity: Math.abs(qty),
            reason: `POS sale item (${resolvedDescription})`,
          },
        });
      }

      await tx.saleItem.create({
        data: { saleId, partId: resolvedPartId, description: resolvedDescription, quantity: qty, unitPrice, lineTotal },
      });

      await recalcSaleTotals(tx, saleId, vat, orgId);
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function addPaymentAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "PAYMENT" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    if (!saleId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, totalAmount: true, status: true, currency: true } });
    if (!existingSale || existingSale.status === "VOID") return;

    const saleCurrency = normalizeCurrency(existingSale.currency, org.baseCurrency);
    if (saleCurrency !== org.baseCurrency) {
      // POS currently assumes sale totals and payments are in org base currency.
      // When enabling non-base POS currencies, collect FX rate at payment time.
      return;
    }

    const safeMethod: PaymentMethod = METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : "OTHER" as PaymentMethod;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orgId,
          saleId,
          invoiceId: null,
          currency: saleCurrency,
          exchangeRateToBase: null,
          amount,
          method: safeMethod,
          reference: reference || null,
          createdById: session.user.id,
        },
      });

      const payAgg = await tx.payment.aggregate({ where: { saleId, orgId }, _sum: { amount: true } });
      const paidAmount = payAgg._sum.amount ?? 0;
      const isPaid = existingSale.totalAmount > 0 && paidAmount >= existingSale.totalAmount;

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount,
          paidAt: isPaid ? new Date() : null,
          status: isPaid ? "PAID" : "OPEN",
        },
      });
    });

    revalidatePath(`/pos/${saleId}`);
    revalidatePath("/reports");
  }

  async function createCreditNoteAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
    // Expired workspaces are read-only except for payment entry.
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    if (!saleId) return;

    const reason = String(formData.get("reason") ?? "").trim() || null;

    const existingSale = await prisma.sale.findFirst({
      where: { id: saleId, orgId },
      select: { id: true, status: true, saleNumber: true, currency: true },
    });
    if (!existingSale || existingSale.status !== "PAID") return;

    const items = await prisma.saleItem.findMany({
      where: { saleId },
      select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, partId: true },
      orderBy: { createdAt: "asc" },
    });

    const picked: Array<{ saleItemId: string; description: string; quantity: number; unitPrice: number; lineTotal: number; partId: string | null }> = [];
    for (const it of items) {
      const raw = String(formData.get(`returnQty:${it.id}`) ?? "").trim();
      if (!raw) continue;
      const qty = Math.max(0, Math.floor(Number(raw)));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (qty > it.quantity) continue;
      picked.push({
        saleItemId: it.id,
        description: it.description,
        quantity: qty,
        unitPrice: it.unitPrice,
        lineTotal: it.unitPrice * qty,
        partId: it.partId,
      });
    }
    if (picked.length === 0) return;

    const currency = normalizeCurrency(existingSale.currency, org.baseCurrency);
    const totalAmount = picked.reduce((sum, p) => sum + p.lineTotal, 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return;

    await prisma.$transaction(async (tx) => {
      const creditNoteNumber = await nextDocumentNumber(tx, "CN", "creditNote");

      const created = await tx.creditNote.create({
        data: {
          orgId,
          saleId,
          creditNoteNumber,
          currency,
          totalAmount,
          reason,
          createdById: session.user.id,
        },
        select: { id: true },
      });

      await tx.creditNoteItem.createMany({
        data: picked.map((p) => ({
          creditNoteId: created.id,
          partId: p.partId,
          description: p.description,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          lineTotal: p.lineTotal,
        })),
      });
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function markItemsReceivedBackAction(formData: FormData) {
    "use server";
    const { user, orgId, session, org } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!saleId || !creditNoteId) return;

    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId, saleId },
      select: { id: true, creditNoteNumber: true, itemsReceivedBackAt: true },
    });
    if (!creditNote || creditNote.itemsReceivedBackAt) return;

    await prisma.$transaction(async (tx) => {
      const items = await tx.creditNoteItem.findMany({ where: { creditNoteId }, select: { partId: true, quantity: true, description: true } });

      for (const it of items) {
        if (!it.partId) continue;
        const part = await tx.part.findFirst({ where: { id: it.partId, orgId, isActive: true }, select: { id: true, qtyOnHand: true, sku: true, name: true } });
        if (!part) continue;
        await tx.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + Math.abs(it.quantity) } });
        await tx.partStockTransaction.create({
          data: {
            partId: part.id,
            saleId,
            type: "IN",
            quantity: Math.abs(it.quantity),
            reason: `Return (${creditNote.creditNoteNumber}) ${it.description || `${part.sku} ${part.name}`}`,
            createdById: session.user.id,
          },
        });
      }

      await tx.creditNote.update({
        where: { id: creditNoteId },
        data: {
          itemsReceivedBackAt: new Date(),
          itemsReceivedBackById: session.user.id,
          itemsReceivedBackNote: note,
        },
      });
    });

    revalidatePath(`/pos/${saleId}`);
  }

  async function createRefundAction(formData: FormData) {
    "use server";
    const { user, orgId, org, session } = await requireOrgSession();
    if (!(can.viewFinancials(user) || ["ADMIN", "OPS"].includes(user.role))) redirect("/dashboard");
    // Expired workspaces are read-only except for payment entry.
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const saleId = String(formData.get("saleId") ?? "").trim();
    const creditNoteId = String(formData.get("creditNoteId") ?? "").trim();
    const rawAmount = String(formData.get("amount") ?? "").trim();
    const rawRate = String(formData.get("exchangeRateToBase") ?? "").trim();
    const method = String(formData.get("method") ?? "CASH").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!saleId || !creditNoteId) return;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
    if (!existingSale || existingSale.status !== "PAID") return;

    const creditNote = await prisma.creditNote.findFirst({
      where: { id: creditNoteId, orgId, saleId },
      select: { id: true, currency: true, totalAmount: true },
    });
    if (!creditNote) return;

    const refundedAgg = await prisma.refund.aggregate({ where: { orgId, creditNoteId: creditNote.id }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } }));
    const refundedSoFar = refundedAgg._sum.amount ?? 0;
    const refundable = Math.max(0, creditNote.totalAmount - refundedSoFar);
    if (amount > refundable) return;

    const safeMethod: PaymentMethod = METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : "OTHER" as PaymentMethod;

    const currency = normalizeCurrency(creditNote.currency, org.baseCurrency);
    const exchangeRateToBase = currency === org.baseCurrency ? null : (rawRate ? Number(rawRate) : null);
    if (currency !== org.baseCurrency) {
      if (!exchangeRateToBase || !Number.isFinite(exchangeRateToBase) || exchangeRateToBase <= 0) return;
    }

    await prisma.refund.create({
      data: {
        orgId,
        saleId,
        invoiceId: null,
        creditNoteId: creditNote.id,
        currency,
        exchangeRateToBase,
        amount,
        method: safeMethod,
        reference: reference || null,
        createdById: session.user.id,
        note: note || null,
      },
    });

    revalidatePath(`/pos/${saleId}`);
    revalidatePath("/reports");
    revalidatePath("/dashboard");
  }

  const balance = Math.max(0, sale.totalAmount - sale.paidAmount);
  const canDeleteSale = user.role === "ADMIN" && sale.status === "OPEN" && !sale.invoicedAt && sale._count.payments === 0 && sale._count.creditNotes === 0 && sale._count.refunds === 0 && sale._count.deliveryNotes === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/pos" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Sales</Link>
        <div className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)]">
          {sale.branch?.name ?? "No branch"}
        </div>
      </div>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">POS · Sale</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold text-[var(--ink)]">{sale.saleNumber}</p>
            {sale.client ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{sale.client.fullName}</p> : null}
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            sale.status === "PAID"
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
              : sale.status === "VOID"
                ? "border-red-500/20 bg-red-500/10 text-red-600"
                : "border-amber-400/30 bg-amber-400/15 text-amber-700"
          }`}>
            {sale.status}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Subtotal</p>
            <p className="mt-1 text-base font-bold text-[var(--ink)]">{formatMoney(sale.subtotal, saleCurrency)}</p>
            {sale.discountAmount > 0 ? <p className="mt-0.5 text-xs text-red-500">−{formatMoney(sale.discountAmount, saleCurrency)} disc</p> : null}
            {sale.vatAmount > 0 ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">+{formatMoney(sale.vatAmount, saleCurrency)} VAT</p> : null}
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total</p>
            <p className="mt-1 text-base font-bold text-[var(--ink)]">{formatMoney(sale.totalAmount, saleCurrency)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Paid</p>
            <p className="mt-1 text-base font-bold text-emerald-700">{formatMoney(sale.paidAmount, saleCurrency)}</p>
          </div>
          <div className={`rounded-lg border p-3 ${balance > 0 ? "border-amber-400/30 bg-amber-400/10" : "border-emerald-500/20 bg-emerald-500/10"}`}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Balance</p>
            <p className={`mt-1 text-base font-bold ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {balance > 0 ? formatMoney(balance, saleCurrency) : "Cleared"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/sales/${sale.id}/receipt`}
            target="_blank"
            rel="noreferrer"
            className="btn-premium-secondary rounded-lg px-3 py-2 text-sm"
          >
            Receipt PDF
          </a>
          {canDeleteSale ? (
            <form action={deleteSaleAction}>
              <input type="hidden" name="saleId" value={sale.id} />
              <ConfirmSubmitButton message="Delete this open POS sale? Stock will be restored." className="rounded-lg border border-red-400/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">Delete Sale</ConfirmSubmitButton>
            </form>
          ) : null}
        </div>

        <form action={updateSaleAction} className="mt-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 md:grid-cols-[220px_1fr_auto]">
          <input type="hidden" name="saleId" value={sale.id} />
          <select
            name="branchId"
            defaultValue={sale.branchId ?? ""}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
          >
            <option value="">No branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            name="notes"
            defaultValue={sale.notes ?? ""}
            placeholder="Sale note"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
          />
          <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Save Sale</button>
        </form>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Items</p>

        {sale.status === "OPEN" ? (
          <form action={addItemAction} className="mt-3 grid gap-2 md:grid-cols-[1.2fr_1.8fr_80px_140px_auto]">
            <input type="hidden" name="saleId" value={sale.id} />
            <select
              name="partId"
              defaultValue=""
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              title="Optional: pick a part to deduct stock"
            >
              <option value="">Custom item</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name} ({p.qtyOnHand})
                </option>
              ))}
            </select>
            <input
              name="description"
              placeholder="Description"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
            <input
              name="quantity"
              placeholder="Qty"
              defaultValue={1}
              inputMode="numeric"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <input
              name="unitPrice"
              placeholder="Price"
              inputMode="decimal"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Add</button>
          </form>
        ) : null}

        {sale.status === "OPEN" ? (
          <form
            action={async (formData: FormData) => {
              "use server";
              const { user, orgId } = await requireOrgSession();
              if (!(can.viewFinancials(user) || ["ADMIN", "OPS", "FRONT_DESK"].includes(user.role))) redirect("/dashboard");
              const saleId = String(formData.get("saleId") ?? "").trim();
              const raw = String(formData.get("discountAmount") ?? "").trim();
              if (!saleId) return;
              const discountAmount = Math.max(0, Number(raw || "0"));
              if (!Number.isFinite(discountAmount)) return;

              const existingSale = await prisma.sale.findFirst({ where: { id: saleId, orgId }, select: { id: true, status: true } });
              if (!existingSale || existingSale.status !== "OPEN") return;

              await prisma.$transaction(async (tx) => {
                const itemsAgg = await tx.saleItem.aggregate({ where: { saleId }, _sum: { lineTotal: true } });
                const subtotal = itemsAgg._sum.lineTotal ?? 0;
                const capped = Math.max(0, Math.min(discountAmount, subtotal));
                await tx.sale.update({ where: { id: saleId }, data: { discountAmount: capped } });
                await recalcSaleTotals(tx, saleId, true, orgId);
              });

              revalidatePath(`/pos/${saleId}`);
            }}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="saleId" value={sale.id} />
            <div>
              <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Discount</p>
              <input
                name="discountAmount"
                inputMode="decimal"
                defaultValue={sale.discountAmount}
                placeholder="0"
                className="w-36 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              />
            </div>
            <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Apply</button>
          </form>
        ) : null}

        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Total</th>
                {sale.status === "OPEN" ? <th className="px-3 py-2">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {sale.items.map((it) => (
                <tr key={it.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">
                    {sale.status === "OPEN" ? (
                      <input form={`edit-item-${it.id}`} name="description" defaultValue={it.description} className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : it.description}
                  </td>
                  <td className="px-3 py-2">
                    {sale.status === "OPEN" ? (
                      <input form={`edit-item-${it.id}`} name="quantity" defaultValue={it.quantity} inputMode="numeric" className="w-20 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : it.quantity}
                  </td>
                  <td className="px-3 py-2">
                    {sale.status === "OPEN" ? (
                      <input form={`edit-item-${it.id}`} name="unitPrice" defaultValue={it.unitPrice} inputMode="decimal" className="w-28 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50" />
                    ) : formatMoney(it.unitPrice, saleCurrency)}
                  </td>
                  <td className="px-3 py-2">{formatMoney(it.lineTotal, saleCurrency)}</td>
                  {sale.status === "OPEN" ? (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <form id={`edit-item-${it.id}`} action={updateItemAction}>
                          <input type="hidden" name="saleId" value={sale.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <button type="submit" className="btn-premium-secondary rounded-md px-2.5 py-1.5 text-xs">Save</button>
                        </form>
                        <form action={deleteItemAction}>
                          <input type="hidden" name="saleId" value={sale.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <ConfirmSubmitButton message="Delete this POS line item? Stock will be restored if linked to inventory." className="rounded-md border border-red-400/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">Delete</ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {sale.items.length === 0 ? (
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={sale.status === "OPEN" ? 5 : 4}>No items yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Payments</p>

        {sale.status !== "VOID" && balance > 0 ? (
          <form action={addPaymentAction} className="mt-3 grid gap-2 md:grid-cols-[140px_180px_1fr_auto]">
            <input type="hidden" name="saleId" value={sale.id} />
            <input
              name="amount"
              inputMode="decimal"
              placeholder="Amount"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
              required
            />
            <select
              name="method"
              defaultValue={"CASH" as PaymentMethod}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m.replaceAll("_", " ")}</option>
              ))}
            </select>
            <input
              name="reference"
              placeholder="Ref (optional)"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
            />
            <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Add</button>
          </form>
        ) : null}

        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{p.receivedAt.toLocaleString()}</td>
                  <td className="px-3 py-2">{p.method.replaceAll("_", " ")}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{p.reference ?? "-"}</td>
                  <td className="px-3 py-2 font-semibold">{formatMoney(p.amount, normalizeCurrency(p.currency, saleCurrency))}</td>
                </tr>
              ))}
              {sale.payments.length === 0 ? (
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={4}>No payments yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Delivery Notes</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          POS quick sales do not generate delivery notes. Legacy notes remain available for audit/download only.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Delivery Note</th>
                <th className="hidden px-3 py-2 md:table-cell">Delivered</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {deliveryNotes.map((dn) => (
                <tr key={dn.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">
                    <p className="mono font-semibold">{dn.deliveryNoteNumber}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{dn.deliveredByName} → {dn.receivedByName}</p>
                  </td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] md:table-cell">{dn.deliveredAt.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <a href={`/api/delivery-notes/${dn.id}`} target="_blank" rel="noreferrer" className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs">Download</a>
                  </td>
                </tr>
              ))}
              {deliveryNotes.length === 0 ? (
                <tr className="border-t border-[var(--line)]">
                  <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={3}>No delivery notes yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Returns & Refunds</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Credit notes and refunds are only available for paid sales. Stock is only returned when you mark items received back.
        </p>

        {sale.status === "PAID" ? (
          <div className="mt-3 space-y-4">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Issue Credit Note</p>
              <form action={createCreditNoteAction} className="mt-2 space-y-2">
                <input type="hidden" name="saleId" value={sale.id} />
                <input
                  name="reason"
                  placeholder="Reason (optional)"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                />

                <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Sold</th>
                        <th className="px-3 py-2">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((it) => (
                        <tr key={it.id} className="border-t border-[var(--line)]">
                          <td className="px-3 py-2">{it.description}</td>
                          <td className="px-3 py-2 text-[var(--ink-muted)]">{it.quantity}</td>
                          <td className="px-3 py-2">
                            <input
                              name={`returnQty:${it.id}`}
                              defaultValue={0}
                              inputMode="numeric"
                              className="w-28 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]/50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Create Credit Note</button>
              </form>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Refund (Requires Credit Note)</p>
              {creditNotes.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">Create a credit note first.</p>
              ) : (
                <form action={createRefundAction} className="mt-2 grid gap-2 md:grid-cols-[220px_140px_180px_1fr_auto]">
                  <input type="hidden" name="saleId" value={sale.id} />
                  <select name="creditNoteId" defaultValue={creditNotes[0]?.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                    {creditNotes.map((cn) => (
                      <option key={cn.id} value={cn.id}>
                        {cn.creditNoteNumber} · {formatMoney(cn.totalAmount, normalizeCurrency(cn.currency, saleCurrency))}
                      </option>
                    ))}
                  </select>
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="Amount"
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                    required
                  />
                  <input
                    name="exchangeRateToBase"
                    inputMode="decimal"
                    placeholder={`Rate to ${org.baseCurrency} (if needed)`}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                    title={`Only required when currency differs from ${org.baseCurrency}`}
                  />
                  <input
                    name="reference"
                    placeholder="Ref (optional)"
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                  />
                  <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-sm text-white">Refund</button>
                </form>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <div className="bg-[var(--panel-strong)] px-3 py-2">
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Credit Notes</p>
              </div>
              <div className="bg-[var(--panel)] p-3 space-y-3">
                {creditNotes.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No credit notes yet.</p>
                ) : creditNotes.map((cn) => (
                  <div key={cn.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="mono text-sm font-bold text-[var(--ink)]">{cn.creditNoteNumber}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{cn.issuedAt.toLocaleString()}</p>
                        {cn.reason ? <p className="text-xs text-[var(--ink-muted)]">Reason: {cn.reason}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--ink-muted)]">Total</p>
                        <p className="text-sm font-semibold">{formatMoney(cn.totalAmount, normalizeCurrency(cn.currency, saleCurrency))}</p>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {cn.itemsReceivedBackAt ? "Stock received" : "Awaiting stock return"}
                        </p>
                      </div>
                    </div>

                    {cn.items.length ? (
                      <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                            <tr>
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2">Qty</th>
                              <th className="px-3 py-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cn.items.map((it) => (
                              <tr key={it.id} className="border-t border-[var(--line)]">
                                <td className="px-3 py-2">{it.description}</td>
                                <td className="px-3 py-2 text-[var(--ink-muted)]">{it.quantity}</td>
                                <td className="px-3 py-2">{formatMoney(it.lineTotal, normalizeCurrency(cn.currency, saleCurrency))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {!cn.itemsReceivedBackAt ? (
                      <form action={markItemsReceivedBackAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="saleId" value={sale.id} />
                        <input type="hidden" name="creditNoteId" value={cn.id} />
                        <input
                          name="note"
                          placeholder="Stock received note (optional)"
                          className="min-w-[240px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                        />
                        <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Mark Items Received Back</button>
                      </form>
                    ) : cn.itemsReceivedBackNote ? (
                      <p className="mt-2 text-xs text-[var(--ink-muted)]">Note: {cn.itemsReceivedBackNote}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--line)]">
              <div className="bg-[var(--panel-strong)] px-3 py-2">
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Refunds</p>
              </div>
              <div className="bg-[var(--panel)] p-3">
                {refunds.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No refunds yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Credit Note</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Ref</th>
                          <th className="px-3 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refunds.map((r) => (
                          <tr key={r.id} className="border-t border-[var(--line)]">
                            <td className="px-3 py-2 text-[var(--ink-muted)]">{r.refundedAt.toLocaleString()}</td>
                            <td className="px-3 py-2 mono text-[var(--ink-muted)]">
                              {r.creditNoteId ? (creditNotes.find((c) => c.id === r.creditNoteId)?.creditNoteNumber ?? "-") : "-"}
                            </td>
                            <td className="px-3 py-2">{r.method.replaceAll("_", " ")}</td>
                            <td className="px-3 py-2 text-[var(--ink-muted)]">{r.reference ?? "-"}</td>
                            <td className="px-3 py-2 font-semibold">{formatMoney(r.amount, normalizeCurrency(r.currency, saleCurrency))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">This sale must be PAID before you can issue credit notes or refunds.</p>
        )}
      </section>
    </div>
  );
}
