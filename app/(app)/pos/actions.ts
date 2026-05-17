"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getCurrentUserRole } from "@/lib/session";

async function generateSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.sale.count();
  return `POS-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function recalculateSale(saleId: string) {
  const items = await prisma.saleItem.findMany({ where: { saleId } });
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountAmount = items.reduce((sum, item) => sum + item.discount * item.quantity, 0);
  const totalAmount = subtotal - discountAmount;
  await prisma.sale.update({
    where: { id: saleId },
    data: { subtotal, discountAmount, totalAmount },
  });
}

export async function openSession(openingFloat: number) {
  const { session, user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const posSession = await prisma.posSession.create({
    data: {
      operatorId: session.user.id,
      openingFloat,
      status: "OPEN",
    },
  });
  revalidatePath("/pos");
  return posSession;
}

export async function createSale(sessionId: string) {
  const { session, user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const posSession = await prisma.posSession.findUnique({ where: { id: sessionId } });
  if (!posSession || posSession.status !== "OPEN") {
    throw new Error("Session not found or closed");
  }
  const saleNumber = await generateSaleNumber();
  const sale = await prisma.sale.create({
    data: {
      saleNumber,
      posSessionId: sessionId,
      createdById: session.user.id,
      status: "OPEN",
    },
  });
  revalidatePath(`/pos/${sessionId}`);
  return sale;
}

export async function addSaleItem(
  saleId: string,
  item: { description: string; quantity: number; unitPrice: number; discount: number; partId?: string },
) {
  const { user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, status: true, posSessionId: true } });
  if (!sale || sale.status !== "OPEN") {
    throw new Error("Sale not found or not open");
  }
  const lineTotal = item.unitPrice * item.quantity - item.discount * item.quantity;
  await prisma.saleItem.create({
    data: {
      saleId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal,
      ...(item.partId ? { partId: item.partId } : {}),
    },
  });
  await recalculateSale(saleId);
  if (sale.posSessionId) {
    revalidatePath(`/pos/${sale.posSessionId}`);
  }
}

export async function removeSaleItem(itemId: string) {
  const { user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const item = await prisma.saleItem.findUnique({
    where: { id: itemId },
    include: { sale: { select: { status: true, posSessionId: true } } },
  });
  if (!item || item.sale.status !== "OPEN") {
    throw new Error("Item not found or sale not open");
  }
  await prisma.saleItem.delete({ where: { id: itemId } });
  await recalculateSale(item.saleId);
  if (item.sale.posSessionId) {
    revalidatePath(`/pos/${item.sale.posSessionId}`);
  }
}

export async function recordPayment(
  saleId: string,
  payment: { amount: number; method: "CASH" | "CARD" | "MOBILE_MONEY"; reference?: string },
) {
  const { session, user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, status: true, totalAmount: true, paidAmount: true, posSessionId: true },
  });
  if (!sale || sale.status !== "OPEN") {
    throw new Error("Sale not found or not open");
  }
  const createdPayment = await prisma.payment.create({
    data: {
      saleId,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference ?? null,
      createdById: session.user.id,
    },
  });
  const newPaidAmount = sale.paidAmount + payment.amount;
  const isFullyPaid = newPaidAmount >= sale.totalAmount;
  await prisma.sale.update({
    where: { id: saleId },
    data: {
      paidAmount: newPaidAmount,
      ...(isFullyPaid ? { status: "COMPLETED", paidAt: new Date() } : {}),
    },
  });
  if (isFullyPaid && sale.posSessionId) {
    const sessionSales = await prisma.sale.findMany({
      where: { posSessionId: sale.posSessionId, status: "COMPLETED" },
      select: { totalAmount: true },
    });
    const totalSales = sessionSales.reduce((sum, s) => sum + s.totalAmount, 0);
    await prisma.posSession.update({
      where: { id: sale.posSessionId },
      data: { totalSales, salesCount: sessionSales.length },
    });
  }
  if (sale.posSessionId) {
    revalidatePath(`/pos/${sale.posSessionId}`);
  }
  return createdPayment;
}

export async function completeSale(saleId: string) {
  const { user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, status: true, posSessionId: true },
  });
  if (!sale || sale.status !== "OPEN") {
    throw new Error("Sale not found or not open");
  }
  const updated = await prisma.sale.update({
    where: { id: saleId },
    data: { status: "COMPLETED", paidAt: new Date() },
  });
  if (sale.posSessionId) {
    revalidatePath(`/pos/${sale.posSessionId}`);
  }
  return updated;
}

export async function voidSale(saleId: string) {
  const { user } = await getCurrentUserRole();
  if (!can.processRefunds(user)) {
    throw new Error("Not authorised");
  }
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, status: true, posSessionId: true },
  });
  if (!sale || (sale.status !== "OPEN" && sale.status !== "COMPLETED")) {
    throw new Error("Sale cannot be voided");
  }
  const updated = await prisma.sale.update({
    where: { id: saleId },
    data: { status: "VOIDED" },
  });
  if (sale.posSessionId) {
    revalidatePath(`/pos/${sale.posSessionId}`);
  }
  return updated;
}

export async function closeSession(
  sessionId: string,
  opts: { actualClosingBalance: number; notes?: string },
) {
  const { user } = await getCurrentUserRole();
  if (!can.openPosSession(user)) {
    throw new Error("Not authorised");
  }
  const posSession = await prisma.posSession.findUnique({ where: { id: sessionId } });
  if (!posSession || posSession.status !== "OPEN") {
    throw new Error("Session not found or already closed");
  }
  const completedSales = await prisma.sale.findMany({
    where: { posSessionId: sessionId, status: "COMPLETED" },
    select: { totalAmount: true },
  });
  const totalSales = completedSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const updated = await prisma.posSession.update({
    where: { id: sessionId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      actualClosingBalance: opts.actualClosingBalance,
      notes: opts.notes ?? null,
      totalSales,
      salesCount: completedSales.length,
    },
  });
  revalidatePath("/pos");
  return updated;
}
