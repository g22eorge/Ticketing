import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * GET /api/simple-reports?from=2024-01-01&to=2024-01-31
 *
 * Returns a JSON payload with three sections:
 *   - admin:   ticket resolution times (average hours) + CSAT.
 *   - finance: payments received, cash pending, quotation count, debtors total.
 *   - analytics: system uptime placeholder.
 */
export async function GET(req: NextRequest) {
  const session = auth ? await auth.api.getSession({ headers: req.headers }) : null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true, isActive: true },
  });
  if (!user?.isActive || !user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = user.orgId;

  // --- Date range -----------------------------------------------------------
  const fromDate = parseDate(req.nextUrl.searchParams.get("from"));
  const toDateValue = parseDate(req.nextUrl.searchParams.get("to"));
  const dateFilter =
    fromDate || toDateValue
      ? {
          gte: fromDate,
          lte: toDateValue,
        }
      : undefined;

  // --- Admin data -----------------------------------------------------------
  const completedJobs = await prisma.job.findMany({
    where: {
      orgId,
      status: "COMPLETED",
      completedAt: { not: null },
      ...(dateFilter ? { completedAt: dateFilter } : {}),
    },
    select: { receivedAt: true, completedAt: true },
  });

  const avgResolutionHours = completedJobs.length
    ? completedJobs.reduce((sum, j) => {
        const diff = (j.completedAt!.getTime() - j.receivedAt.getTime()) / 36e5;
        return sum + diff;
      }, 0) / completedJobs.length
    : 0;

  // Real CSAT from Survey table
  const surveyAgg = await prisma.survey.aggregate({
    where: { orgId },
    _avg: { rating: true }, // rating is 1-5
    _count: { id: true },
  });
  const csatScore = surveyAgg._avg.rating ?? null;

  // --- Finance data -------------------------------------------------------
  const payments = await prisma.payment.findMany({
    where: {
      orgId,
      ...(dateFilter ? { receivedAt: dateFilter } : {}),
    },
    select: { amount: true },
  });
  const paymentsReceived = payments.reduce((s, p) => s + p.amount, 0);

  // Cash pending – sum invoices not fully paid
  const unpaidInvoices = await prisma.invoice.findMany({
    where: {
      orgId,
      status: { not: "PAID" },
      ...(dateFilter ? { issuedAt: dateFilter } : {}),
    },
    select: { totalAmount: true, paidAmount: true },
  });
  const cashPending = unpaidInvoices.reduce(
    (s, inv) => s + (inv.totalAmount - (inv.paidAmount ?? 0)),
    0,
  );

  const quotationsCount = await prisma.quotation.count({
    where: {
      orgId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
  });

  // Debtors – outstanding receivables (unpaid invoices)
  const receivables = await prisma.invoice
    .aggregate({
      where: { orgId, status: { not: "PAID" } },
      _sum: { totalAmount: true },
    })
    .catch(() => ({ _sum: { totalAmount: 0 } } as { _sum: { totalAmount: number | null } }));
  const debtorsTotal = receivables._sum.totalAmount ?? 0;

  // --- Analytics data ------------------------------------------------------
  const uptime = "N/A";

  const payload = {
    admin: {
      avgResolutionHours: Number(avgResolutionHours.toFixed(2)),
      csatScore,
    },
    finance: {
      paymentsReceived: Number(paymentsReceived.toFixed(2)),
      cashPending: Number(cashPending.toFixed(2)),
      quotationsCount,
      debtorsTotal: Number(debtorsTotal.toFixed(2)),
    },
    analytics: {
      uptime,
    },
    meta: {
      from: fromDate?.toISOString() ?? null,
      to: toDateValue?.toISOString() ?? null,
      orgId,
      generatedAt: new Date().toISOString(),
    },
  };

  return NextResponse.json(payload);
}
