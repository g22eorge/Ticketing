import { InvoiceType } from "@prisma/client";

import { toBaseAmount } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

export type DateRange = {
  start: Date;
  end?: Date;
};

function dateWhere(range: DateRange) {
  return range.end ? { gte: range.start, lte: range.end } : { gte: range.start };
}

function baseAmount(row: {
  amount: number;
  currency: string | null;
  exchangeRateToBase: number | null;
}, baseCurrency: string) {
  return toBaseAmount({
    amount: row.amount,
    currency: row.currency,
    baseCurrency,
    exchangeRateToBase: row.exchangeRateToBase,
  });
}

export async function loadCashCollectionsByChannel(params: {
  orgId: string;
  baseCurrency: string;
  range: DateRange;
}) {
  const payments = await prisma.payment.findMany({
    where: {
      orgId: params.orgId,
      kind: "PAYMENT",
      receivedAt: dateWhere(params.range),
    },
    select: {
      amount: true,
      currency: true,
      exchangeRateToBase: true,
      saleId: true,
      invoice: { select: { invoiceType: true } },
    },
  });

  const legacyRepairPayments = await prisma.job.findMany({
    where: {
      orgId: params.orgId,
      clientPaid: true,
      clientPaidAt: dateWhere(params.range),
    },
    select: {
      clientBill: true,
      invoice: { select: { id: true } },
    },
  });

  const channels = {
    repairs: 0,
    products: 0,
    corporate: 0,
    unallocated: 0,
  };

  for (const payment of payments) {
    const amount = baseAmount(payment, params.baseCurrency);
    if (payment.saleId) {
      channels.products += amount;
    } else if (payment.invoice?.invoiceType === InvoiceType.REPAIR) {
      channels.repairs += amount;
    } else if (payment.invoice) {
      channels.corporate += amount;
    } else {
      channels.unallocated += amount;
    }
  }

  for (const job of legacyRepairPayments) {
    if (job.invoice) continue;
    channels.repairs += job.clientBill ?? 0;
  }

  const total = channels.repairs + channels.products + channels.corporate + channels.unallocated;
  return { ...channels, total };
}

type ChannelTotals = { repairs: number; products: number; corporate: number; unallocated: number; total: number };

function zeroChannels(): ChannelTotals {
  return { repairs: 0, products: 0, corporate: 0, unallocated: 0, total: 0 };
}

function bucketchannels(
  payments: { amount: number; currency: string | null; exchangeRateToBase: number | null; saleId: string | null; receivedAt: Date | null; invoice: { invoiceType: string } | null }[],
  legacyJobs: { clientBill: number | null; clientPaidAt: Date | null; invoice: { id: string } | null }[],
  baseCurrency: string,
  range: { start: Date; end?: Date },
): ChannelTotals {
  const channels = { repairs: 0, products: 0, corporate: 0, unallocated: 0 };
  const end = range.end ?? new Date(8640000000000000);
  for (const p of payments) {
    if (!p.receivedAt || p.receivedAt < range.start || p.receivedAt > end) continue;
    const amount = toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency, exchangeRateToBase: p.exchangeRateToBase });
    if (p.saleId) channels.products += amount;
    else if (p.invoice?.invoiceType === InvoiceType.REPAIR) channels.repairs += amount;
    else if (p.invoice) channels.corporate += amount;
    else channels.unallocated += amount;
  }
  for (const j of legacyJobs) {
    if (j.invoice || !j.clientPaidAt || j.clientPaidAt < range.start || j.clientPaidAt > end) continue;
    channels.repairs += j.clientBill ?? 0;
  }
  const total = channels.repairs + channels.products + channels.corporate + channels.unallocated;
  return { ...channels, total };
}

/** Single wide fetch covering mtdStart→today, bucketed into mtd/today/yesterday — 2 queries not 6 */
export async function loadCashCollectionsByChannelWide(params: {
  orgId: string;
  baseCurrency: string;
  mtdStart: Date;
  todayStart: Date;
  yesterdayStart: Date;
  yesterdayEnd: Date;
}): Promise<{ mtd: ChannelTotals; today: ChannelTotals; yesterday: ChannelTotals }> {
  const { orgId, baseCurrency, mtdStart, todayStart, yesterdayStart, yesterdayEnd } = params;
  const todayEnd = new Date(8640000000000000);

  const [payments, legacyJobs] = await Promise.all([
    prisma.payment.findMany({
      where: { orgId, kind: "PAYMENT", receivedAt: { gte: mtdStart } },
      select: { amount: true, currency: true, exchangeRateToBase: true, saleId: true, receivedAt: true, invoice: { select: { invoiceType: true } } },
    }),
    prisma.job.findMany({
      where: { orgId, clientPaid: true, clientPaidAt: { gte: mtdStart } },
      select: { clientBill: true, clientPaidAt: true, invoice: { select: { id: true } } },
    }),
  ]);

  // Re-type for bucketchannels signature
  const pRows = payments.map(p => ({ ...p, receivedAt: p.receivedAt as Date | null, invoice: p.invoice ? { invoiceType: p.invoice.invoiceType as string } : null }));
  const jRows = legacyJobs.map(j => ({ ...j, clientPaidAt: j.clientPaidAt as Date | null, invoice: j.invoice }));

  return {
    mtd:       bucketchannels(pRows, jRows, baseCurrency, { start: mtdStart }),
    today:     bucketchannels(pRows, jRows, baseCurrency, { start: todayStart, end: todayEnd }),
    yesterday: bucketchannels(pRows, jRows, baseCurrency, { start: yesterdayStart, end: yesterdayEnd }),
  };
}

export async function loadRefundsTotal(params: {
  orgId: string;
  baseCurrency: string;
  range: DateRange;
}) {
  const refunds = await prisma.refund.findMany({
    where: { orgId: params.orgId, refundedAt: dateWhere(params.range) },
    select: { amount: true, currency: true, exchangeRateToBase: true },
  });

  return refunds.reduce((sum, refund) => sum + baseAmount(refund, params.baseCurrency), 0);
}

export async function loadExpensesTotal(params: {
  orgId: string;
  range: DateRange;
}) {
  const expenses = await prisma.expense.findMany({
    where: { orgId: params.orgId, paidAt: dateWhere(params.range) },
    select: { amount: true },
  });

  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

export async function loadReceivablesTotal(orgId: string) {
  const [invoices, sales] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId, status: { not: "VOID" } },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.sale.findMany({
      where: { orgId, status: { not: "VOID" } },
      select: { totalAmount: true, paidAmount: true },
    }),
  ]);

  const invoiceBalance = invoices.reduce((sum, invoice) => {
    return sum + Math.max(0, invoice.totalAmount - invoice.paidAmount);
  }, 0);
  const saleBalance = sales.reduce((sum, sale) => {
    return sum + Math.max(0, sale.totalAmount - sale.paidAmount);
  }, 0);

  return {
    invoiceBalance,
    saleBalance,
    total: invoiceBalance + saleBalance,
    invoiceCount: invoices.filter((invoice) => invoice.totalAmount > invoice.paidAmount).length,
    saleCount: sales.filter((sale) => sale.totalAmount > sale.paidAmount).length,
  };
}

export async function loadBilledTotals(params: {
  orgId: string;
  range: DateRange;
}) {
  const [invoices, sales] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        orgId: params.orgId,
        status: { not: "VOID" },
        issuedAt: dateWhere(params.range),
      },
      select: { totalAmount: true, invoiceType: true },
    }),
    prisma.sale.findMany({
      where: {
        orgId: params.orgId,
        status: { not: "VOID" },
        createdAt: dateWhere(params.range),
      },
      select: { totalAmount: true },
    }),
  ]);

  const repairs = invoices
    .filter((invoice) => invoice.invoiceType === InvoiceType.REPAIR)
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const corporate = invoices
    .filter((invoice) => invoice.invoiceType !== InvoiceType.REPAIR)
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const products = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  return {
    repairs,
    products,
    corporate,
    total: repairs + products + corporate,
  };
}
