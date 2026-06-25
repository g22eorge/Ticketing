import Link from "next/link";

import { requireOrgSession } from "@/lib/org-context";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** Formats a number as currency with 2 decimal places. */
function formatMoney(amount: number | null | undefined, currency = "UGX"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface ReportData {
  admin: { avgResolutionHours: number; csatScore: number | null };
  finance: {
    paymentsReceived: number;
    cashPending: number;
    quotationsCount: number;
    debtorsTotal: number;
    invoicesIssued: number;
    overdueInvoices: number;
  };
  operations: {
    jobsReceived: number;
    jobsCompleted: number;
    jobsPending: number;
    quoteConversionRate: number | null;
  };
  meta: { from: string | null; to: string | null; orgId: string; generatedAt: string };
}

async function getReportData(orgId: string, from: string | null, to: string | null): Promise<ReportData> {
  const fromDate = parseDate(from);
  const toDateValue = parseDate(to);
  const dateFilter = fromDate || toDateValue
    ? { gte: fromDate, lte: toDateValue }
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

  const surveyWhere = orgId ? { orgId, ...(dateFilter ? { createdAt: dateFilter } : {}) } : {};
  const surveyAgg = await prisma.survey.aggregate({
    where: surveyWhere,
    _avg: { rating: true },
    _count: { id: true },
  });
  const csatScore = surveyAgg._avg.rating ?? null;

  // --- Finance data -------------------------------------------------------
  const payments = await prisma.payment.findMany({
    where: { orgId, ...(dateFilter ? { receivedAt: dateFilter } : {}) },
    select: { amount: true },
  });
  const paymentsReceived = payments.reduce((s, p) => s + p.amount, 0);

  const unpaidInvoices = await prisma.invoice.findMany({
    where: { orgId, status: { not: "PAID" }, ...(dateFilter ? { issuedAt: dateFilter } : {}) },
    select: { totalAmount: true, paidAmount: true },
  });
  const cashPending = unpaidInvoices.reduce((s, inv) => s + (inv.totalAmount - (inv.paidAmount ?? 0)), 0);

  const quotationsCount = await prisma.quotation.count({
    where: { orgId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
  });

  const receivables = await prisma.invoice
    .aggregate({ where: { orgId, status: { not: "PAID" } }, _sum: { totalAmount: true } })
     .catch(() => ({ _sum: { totalAmount: 0 } } as { _sum: { totalAmount: number | null } }));
  const debtorsTotal = receivables._sum.totalAmount ?? 0;

  // New invoice metrics
  const invoicesIssued = await prisma.invoice.count({
    where: { orgId, ...(dateFilter ? { issuedAt: dateFilter } : {}) },
  });

  const overdueInvoices = await prisma.invoice.count({
    where: {
      orgId,
      status: { not: "PAID" },
      dueDate: { lt: new Date() },
    },
  });

  // --- Operations data ------------------------------------------------------
  const jobsReceived = await prisma.job.count({
    where: { orgId, ...(dateFilter ? { receivedAt: dateFilter } : {}) },
  });

  const jobsPending = await prisma.job.count({
    where: {
      orgId,
      status: { notIn: ["COMPLETED", "DELIVERED", "CLOSED"] },
      ...(dateFilter ? { receivedAt: dateFilter } : {}),
    },
  });

  const [quotesTotal, quotesConverted] = await Promise.all([
    prisma.quotation.count({
      where: { orgId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    }),
    prisma.quotation.count({
      where: {
        orgId,
        convertedToInvoiceId: { not: null },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    }),
  ]);

  const quoteConversionRate = quotesTotal > 0 ? quotesConverted / quotesTotal : null;

  return {
    admin: { avgResolutionHours: Number(avgResolutionHours.toFixed(2)), csatScore },
    finance: {
      paymentsReceived: Number(paymentsReceived.toFixed(2)),
      cashPending: Number(cashPending.toFixed(2)),
      quotationsCount,
      debtorsTotal: Number(debtorsTotal.toFixed(2)),
      invoicesIssued,
      overdueInvoices,
    },
    operations: {
      jobsReceived,
      jobsCompleted: completedJobs.length,
      jobsPending,
      quoteConversionRate: quoteConversionRate !== null ? Number(quoteConversionRate.toFixed(2)) : null,
    },
    meta: {
      from: fromDate?.toISOString() ?? null,
      to: toDateValue?.toISOString() ?? null,
      orgId,
      generatedAt: new Date().toISOString(),
    },
  };
}

export default async function ReportsDashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.viewAccountsSummary(user)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--ink-muted)]">You do not have access to this page.</p>
      </div>
    );
  }

  const { from, to } = await searchParams;
  const data = await getReportData(orgId, from ?? null, to ?? null);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Analytics
          </p>
          <h1 className="mt-0.5 text-xl font-black text-[var(--ink)]">Reports Dashboard</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            {data.meta.from && data.meta.to
              ? `${data.meta.from.slice(0, 10)} → ${data.meta.to.slice(0, 10)}`
              : "All time"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/api/reports/export?type=summary`}
            className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--panel-strong)]"
          >
            ↓ Download CSV
          </Link>
          </div>
          {/* Invoices Issued */}
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Invoices Issued</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
              {data.finance.invoicesIssued}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Total invoices this period</p>
          </div>
          {/* Overdue Invoices */}
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Overdue Invoices</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-rose-600">
              {data.finance.overdueInvoices}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Past due, unpaid</p>
          </div>
        </div>

      {/* ── Admin Section ── */}
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Admin</p>
        </div>
        <div className="grid gap-px sm:grid-cols-2">
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Avg. Resolution Time</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
              {data.admin.avgResolutionHours.toFixed(1)}h
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Average hours to close a ticket</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">CSAT Score</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
              {data.admin.csatScore !== null ? data.admin.csatScore.toFixed(1) : "—"} / 5
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Customer satisfaction average (period)</p>
          </div>
        </div>
      </section>

      {/* ── Finance Section ── */}
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
        </div>
        <div className="grid gap-px sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Payments Received</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-500">
              {formatMoney(data.finance.paymentsReceived)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Total cash collected</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Cash Pending</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-500">
              {formatMoney(data.finance.cashPending)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Unpaid invoices</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Quotations</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
              {data.finance.quotationsCount}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Total quotes issued</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Debtors</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-red-500">
              {formatMoney(data.finance.debtorsTotal)}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">Outstanding receivables</p>
          </div>
        </div>
      </section>

  {/* ── Operations Section ── */}
  <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
    <div className="border-b border-[var(--line)] px-4 py-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Operations</p>
    </div>
    <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
      <div className="px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Jobs Received</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
          {data.operations.jobsReceived}
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">In this period</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Jobs Completed</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-emerald-500">
          {data.operations.jobsCompleted}
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Resolved tickets</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Jobs Pending</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-amber-500">
          {data.operations.jobsPending}
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Active queue</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Quote Conversion</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">
          {data.operations.quoteConversionRate !== null ? `${(data.operations.quoteConversionRate * 100).toFixed(0)}%` : "—"}
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Quotes turned into invoices</p>
      </div>
    </div>
  </section>

      {/* Footer timestamp */}
      <div className="text-center text-xs text-[var(--ink-muted)]">
        Generated at {new Date(data.meta.generatedAt).toLocaleString()} · Org ID: {data.meta.orgId}
      </div>
    </div>
  );
}
