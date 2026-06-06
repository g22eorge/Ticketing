export const dynamic = "force-dynamic";

import Link from "next/link";
import React from "react";

import { MobileHomeDashboard } from "@/components/mobile/MobileHomeDashboard";
import { PersistedDisclosure } from "@/components/mobile/PersistedDisclosure";
import { StickyKpiRow } from "@/components/mobile/StickyKpiRow";
import { MonthSelectForm } from "@/components/shared/MonthSelectForm";
import { RevenueLineChart } from "@/components/reports/ReportsCharts";
import { getClientBill, resolveTechCost } from "@/lib/billing";
import { formatMoney, formatMoneyCompact, getAppCurrency, toBaseAmount } from "@/lib/currency";
import { formatEATMonthLabel } from "@/lib/date-eat";
import { loadCashCollectionsByChannelWide, loadReceivablesTotal } from "@/lib/finance/reconciliation";
import { UI_JOB_STATUSES, JobStatus, isOpenJobStatus, normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { getJobPayoutsByIds } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { getOrgModules } from "@/lib/module-access";

type SearchParams = {
  month?: string;
  year?: string;
  period?: string;
};

function parseMonth(monthParam?: string) {
  if (!monthParam) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const [y, m] = monthParam.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: y, month: m };
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function yearRange(year: number) {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
}

function monthLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function asDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthSequence(endYear: number, endMonth: number, count: number) {
  return Array.from({ length: count }, (_, idx) => {
    const d = new Date(endYear, endMonth - 1 - (count - 1 - idx), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  });
}

function monthCountInclusive(startYear: number, startMonth: number, endYear: number, endMonth: number) {
  const startIndex = startYear * 12 + (startMonth - 1);
  const endIndex = endYear * 12 + (endMonth - 1);
  return Math.max(1, endIndex - startIndex + 1);
}

function trendMonthsSinceStartOfYear(end: Date) {
  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;
  const count = monthCountInclusive(endYear, 1, endYear, endMonth);
  return monthSequence(endYear, endMonth, count);
}

function trendMonthsForYear(year: number, endMonth: number) {
  const safeMonth = Math.min(12, Math.max(1, endMonth));
  const count = monthCountInclusive(year, 1, year, safeMonth);
  return monthSequence(year, safeMonth, count);
}

/** Repair revenue only — job clientBill on COMPLETED jobs (used by TECH_MANAGER) */
async function loadRepairRevenueTrend(trendMonths: { key: string; start: Date; end: Date }[], orgId?: string | null) {
  // Single query — externalTechFee (admin override) and externalTechBill both selected directly,
  // eliminating the second getJobPayoutsByIds round-trip
  const completed = await prisma.job.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      status: "COMPLETED",
      completedAt: { gte: trendMonths[0].start, lte: trendMonths[trendMonths.length - 1].end },
    },
    select: { id: true, clientBill: true, externalTechFee: true, externalTechBill: true, completedAt: true },
  });

  return trendMonths.map((m) => {
    const monthJobs = completed.filter((j) => j.completedAt && j.completedAt >= m.start && j.completedAt <= m.end);
    const revenue = monthJobs.reduce((sum, j) => sum + (getClientBill(j) ?? 0), 0);
    const cost = monthJobs.reduce((sum, j) => sum + resolveTechCost(j.externalTechFee, j.externalTechBill), 0);
    return { key: m.key, revenue, margin: revenue - cost };
  });
}

/** Sales revenue only — single wide-range fetch, bucketed in memory (2 queries total, not N×2) */
async function loadSalesRevenueTrend(trendMonths: { key: string; start: Date; end: Date }[], orgId?: string | null, currency = getAppCurrency()) {
  if (!orgId || trendMonths.length === 0) return trendMonths.map((m) => ({ key: m.key, revenue: 0, margin: 0 }));
  const rangeStart = trendMonths[0].start;
  const rangeEnd   = trendMonths[trendMonths.length - 1].end;

  const [payments] = await Promise.all([
    prisma.payment.findMany({
      where: { orgId, kind: "PAYMENT", receivedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { amount: true, currency: true, exchangeRateToBase: true, saleId: true, receivedAt: true, invoice: { select: { invoiceType: true } } },
    }),
  ]);

  return trendMonths.map((m) => {
    let revenue = 0;
    for (const p of payments) {
      if (!p.receivedAt || p.receivedAt < m.start || p.receivedAt > m.end) continue;
      const amt = toBaseAmount({ amount: p.amount, currency: p.currency, baseCurrency: currency, exchangeRateToBase: p.exchangeRateToBase });
      // sales channel = POS sales or non-repair invoices
      if (p.saleId || (p.invoice && p.invoice.invoiceType !== "REPAIR")) revenue += amt;
    }
    return { key: m.key, revenue, margin: revenue };
  });
}

/** Total revenue — repairs + POS + invoices combined (used by ADMIN) */
async function loadTotalRevenueTrend(trendMonths: { key: string; start: Date; end: Date }[], orgId?: string | null, currency = getAppCurrency()) {
  const [repairTrend, salesTrend] = await Promise.all([
    loadRepairRevenueTrend(trendMonths, orgId),
    loadSalesRevenueTrend(trendMonths, orgId, currency),
  ]);

  return trendMonths.map((m, i) => ({
    key: m.key,
    revenue: (repairTrend[i]?.revenue ?? 0) + (salesTrend[i]?.revenue ?? 0),
    margin:  (repairTrend[i]?.margin  ?? 0) + (salesTrend[i]?.margin  ?? 0),
  }));
}

function RevenueMarginTrendSection({
  trendMonths,
  revenueTrend,
  currency,
  label = "Revenue & Margin Trend",
  emptyMessage = "No revenue yet for this period.",
}: {
  trendMonths: { key: string; start: Date; end: Date }[];
  revenueTrend: { key: string; revenue: number; margin: number }[];
  currency: string;
  label?: string;
  emptyMessage?: string;
}) {
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
            {trendMonths[0]?.key} – {trendMonths[trendMonths.length - 1]?.key}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-full bg-[var(--accent)]" />
            Revenue
          </span>
          {revenueTrend.some((m) => m.revenue > 0 || m.margin > 0) && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400/90" />
              Margin
            </span>
          )}
        </div>
      </div>

      {revenueTrend.every((m) => m.revenue === 0 && m.margin === 0) ? (
        <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink-muted)]">
          {emptyMessage}
        </div>
      ) : null}

      <RevenueLineChart data={revenueTrend} currency={currency} />
      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {revenueTrend.map((m) => {
            const range = trendMonths.find((t) => t.key === m.key);
            const href = range
              ? `/jobs?status=COMPLETED&dateField=completedAt&from=${asDateInputValue(range.start)}&to=${asDateInputValue(range.end)}`
              : "/jobs?status=COMPLETED";
            return (
              <Link
                key={m.key}
                href={href}
                className="w-[92px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-2 text-center transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5"
              >
                <p className="text-[13px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">{m.key.slice(5)}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--accent)]">{formatMoneyCompact(m.revenue, currency)}</p>
                <p className={`text-[12px] ${m.margin >= 0 ? "text-emerald-600" : "text-[var(--ink)]"}`}>{formatMoneyCompact(m.margin, currency)}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function monthOptions(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = monthLabel(date.getFullYear(), date.getMonth() + 1);
    const label = formatEATMonthLabel(date.getFullYear(), date.getMonth() + 1);
    return { value, label };
  });
}

function yearOptions(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const year = now.getFullYear() - index;
    return { value: String(year), label: `${year} Annual Package` };
  });
}

const statusLabel: Record<ReturnType<typeof normalizeJobStatus>, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const repairFlowReference = [
  { key: "RECEIVED", label: "Received", href: "/jobs?status=RECEIVED", tone: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]" },
  { key: "DIAGNOSING", label: "Diagnosing", href: "/jobs?status=DIAGNOSING", tone: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]" },
  { key: "REFERRED", label: "Referred", href: "/jobs?status=REFERRED", tone: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]" },
  { key: "AWAITING_APPROVAL", label: "Awaiting Approval", href: "/jobs?status=AWAITING_APPROVAL", tone: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]" },
  { key: "IN_REPAIR", label: "In Repair", href: "/jobs?status=IN_REPAIR", tone: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)]" },
  { key: "READY_FOR_PICKUP", label: "Ready for Pickup", href: "/jobs?status=READY_FOR_PICKUP", tone: "border-[var(--accent)] bg-[var(--accent)] text-white" },
  { key: "COMPLETED", label: "Completed", href: "/jobs?status=COMPLETED", tone: "border-[var(--accent)] bg-[var(--accent)] text-white" },
  { key: "CLOSED", label: "Closed", href: "/jobs?status=CLOSED", tone: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]" },
] as const;

function RepairStatusReference({
  title,
  guidance,
}: {
  title: string;
  guidance: string;
}) {
  return (
    <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[linear-gradient(135deg,rgba(212,175,55,0.06),rgba(212,175,55,0.02))]">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Repair Status Guide</p>
        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{guidance}</p>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:thin]">
        {repairFlowReference.map((step, index) => (
          <div key={step.key} className="flex shrink-0 items-center gap-2">
            <Link href={step.href} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-[1px] ${step.tone}`}>
              {step.label}
            </Link>
            {index < repairFlowReference.length - 1 ? <span className="text-[12px] text-[var(--ink-muted)]">→</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardPeriodBar({
  period,
  monthHref,
  yearHref,
  selectorName,
  selectorValue,
  selectorOptions,
  actionHref,
  actionLabel,
}: {
  period: "month" | "year";
  monthHref: string;
  yearHref: string;
  selectorName: "month" | "year";
  selectorValue: string;
  selectorOptions: Array<{ value: string; label: string }>;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="panel-shadow flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      {/* Period toggle */}
      <div className="flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-1">
        <Link
          href={monthHref}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all ${
            period === "month"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Monthly
        </Link>
        <Link
          href={yearHref}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all ${
            period === "year"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Annual
        </Link>
      </div>
      <MonthSelectForm
        name={selectorName}
        value={selectorValue}
        options={selectorOptions}
        hiddenFields={{ period }}
        className="flex items-center"
        selectClassName="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]/50"
      />
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="ml-auto rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[13px] font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function DashboardHero({
  title,
  summary: _summary,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  extraActions,
  icon: _icon,
}: {
  title: string;
  summary: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  extraActions?: { href: string; label: string }[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
      <p className="text-[13px] font-bold text-[var(--ink)]">{title}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={primaryHref} className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
          >
            {secondaryLabel}
          </Link>
        ) : null}
        {extraActions?.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user } = await getCurrentUserRole();
  const permissionUser = { role: user.role, permissions: user.permissions };
  const filters = await searchParams;
  const period: "month" | "year" = filters.period === "year" ? "year" : "month";

  if (user.role === "TECHNICIAN_EXTERNAL") {
    const selectedMonth = parseMonth(filters.month);
    const selectedYear = Number(filters.year) || new Date().getFullYear();
    const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
    const selectedPeriodLabel = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
    const selectablePeriods = period === "year" ? yearOptions(6) : monthOptions(18);

    const jobs = await prisma.job.findMany({
      where: {
        ...(user.orgId ? { orgId: user.orgId } : {}),
        assignedToId: session.user.id,
        OR: [
          { receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
          { updatedAt: { gte: selectedRange.start, lte: selectedRange.end } },
          { completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        repairPath: true,
        externalTechBill: true,
      },
    });

    const payouts = await getJobPayoutsByIds(jobs.map((job) => job.id)).catch(() => new Map());

    const currency = getAppCurrency();
    const openCount = jobs.filter((job) => isOpenJobStatus(job.status)).length;
    const completedCount = jobs.filter((job) => job.status === "COMPLETED").length;
    const paidTotal = jobs
      .filter((job) => payouts.get(job.id)?.externalPaid)
      .reduce((sum, job) => sum + resolveTechCost(payouts.get(job.id)?.externalTechFee, job.externalTechBill), 0);
    const outstandingTotal = jobs
      .filter((job) => job.status === "COMPLETED" && !payouts.get(job.id)?.externalPaid)
      .reduce((sum, job) => sum + resolveTechCost(payouts.get(job.id)?.externalTechFee, job.externalTechBill), 0);

    return (
      <div className="space-y-4">
        <DashboardPeriodBar
          period={period}
          monthHref={`/dashboard?period=month&month=${monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}`}
          yearHref={`/dashboard?period=year&year=${new Date().getFullYear()}`}
          selectorName={period === "year" ? "year" : "month"}
          selectorValue={selectedPeriodLabel}
          selectorOptions={selectablePeriods}
        />

        <DashboardHero
          title="External Technician Control Board"
          summary={`${jobs.length} assigned · ${openCount} open · ${completedCount} completed · ${formatMoneyCompact(outstandingTotal, currency)} payout pending`}
          primaryHref="/technicians"
          primaryLabel="Open Work Queue"
          secondaryHref="/technicians/payouts"
          secondaryLabel="Review Payouts"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
        />

        <div className="hidden gap-3 2xl:grid 2xl:grid-cols-4">
          <Link href="/technicians" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned Jobs ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold">{jobs.length}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Open queue →</p>
          </Link>
          <Link href="/technicians?ready=1" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open Jobs ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{openCount}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Jobs needing action →</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{completedCount}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Completed jobs →</p>
          </Link>
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Payout Outstanding</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{formatMoneyCompact(outstandingTotal, currency)}</p>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">Paid to date: {formatMoneyCompact(paidTotal, currency)}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">
              <Link href="/technicians/payouts">View payout breakdown →</Link>
            </p>
          </div>
        </div>

        <PersistedDisclosure
          title="Recent Assigned Jobs"
          storageKey="dashboard.external.recentAssigned"
          groupName="mobile-dashboard-sections"
          className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
        >
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No assigned jobs yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {jobs.slice(0, 6).map((job) => (
                <li key={job.id} className="flex flex-col items-start justify-between gap-2 border-b border-[var(--line)] py-2">
                  <div className="min-w-0">
                    <p className="mono truncate font-bold text-[var(--accent)]">{job.jobNumber}</p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {statusLabel[job.status as keyof typeof statusLabel] ?? job.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--ink-muted)]">Fee</p>
                    <p className="font-medium">{formatMoney(resolveTechCost(payouts.get(job.id)?.externalTechFee, job.externalTechBill), currency)}</p>
                    <p className={`text-xs ${payouts.get(job.id)?.externalPaid ? "text-[var(--accent)]" : "text-[var(--accent)]"}`}>
                      {payouts.get(job.id)?.externalPaid ? "Paid" : "Unpaid"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PersistedDisclosure>
      </div>
    );
  }

  if (user.role === "TECHNICIAN_INTERNAL") {
    const selectedMonth = parseMonth(filters.month);
    const selectedYear = Number(filters.year) || new Date().getFullYear();
    const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
    const selectedPeriodLabel = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
    const selectablePeriods = period === "year" ? yearOptions(6) : monthOptions(18);

    const assignedJobs = await prisma.job.findMany({
      where: {
        assignedToId: session.user.id,
        OR: [
          { receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
          { updatedAt: { gte: selectedRange.start, lte: selectedRange.end } },
          { completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, jobNumber: true, status: true, device: { select: { brand: true, model: true } } },
    }).catch(async () => {
      const fallback = await prisma.job.findMany({
        where: {
          assignedToId: session.user.id,
          OR: [
            { receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
            { updatedAt: { gte: selectedRange.start, lte: selectedRange.end } },
            { completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, jobNumber: true, status: true },
      });

      return fallback.map((job) => ({ ...job, device: null }));
    });

    const diagnosing = assignedJobs.filter((job) => job.status === "DIAGNOSING").length;
    const inRepair = assignedJobs.filter((job) => job.status === "IN_REPAIR").length;
    const completed = assignedJobs.filter((job) => job.status === "COMPLETED").length;
    const canUpdatePricing = can.approveInvoices(permissionUser);
    const pricingScopeWhere = {
      ...(canUpdatePricing ? {} : { assignedToId: session.user.id }),
    };
    const [pricingPendingCount, pricedCount, assignedFinancials] = canUpdatePricing
      ? await Promise.all([
          prisma.job.count({
            where: {
              ...pricingScopeWhere,
              status: { in: ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"] },
              clientBill: null,
            },
          }),
          prisma.job.count({
            where: {
              ...pricingScopeWhere,
              status: { in: ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP", "COMPLETED", "CLOSED"] },
              clientBill: { not: null },
            },
          }),
          prisma.job.findMany({
            where: {
              ...pricingScopeWhere,
              status: { in: ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP", "COMPLETED", "CLOSED"] },
              clientBill: { not: null },
            },
            select: {
              clientBill: true,
              externalTechBill: true,
            },
          }),
        ])
      : [0, 0, []];
    const clientBillingTotal = assignedFinancials.reduce((sum, job) => sum + (job.clientBill ?? 0), 0);
    const externalCostTotal = assignedFinancials.reduce((sum, job) => sum + (job.externalTechBill ?? 0), 0);
    const marginTotal = clientBillingTotal - externalCostTotal;

    return (
      <div className="space-y-4">
        <DashboardPeriodBar
          period={period}
          monthHref={`/dashboard?period=month&month=${monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}`}
          yearHref={`/dashboard?period=year&year=${new Date().getFullYear()}`}
          selectorName={period === "year" ? "year" : "month"}
          selectorValue={selectedPeriodLabel}
          selectorOptions={selectablePeriods}
        />

        <DashboardHero
          title="Internal Bench Workspace"
          summary="Keep diagnostics, repairs, and handoffs flowing · jump directly into the next action queue."
          primaryHref="/jobs"
          primaryLabel="Open Assigned Jobs"
          secondaryHref={canUpdatePricing ? "/jobs?pricing=needs&status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" : "/jobs?status=DIAGNOSING"}
          secondaryLabel={canUpdatePricing ? "Resolve Pricing Queue" : "Focus Diagnosis Queue"}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="9" rx="1"/><rect x="15" y="3" width="7" height="5" rx="1"/><rect x="15" y="12" width="7" height="9" rx="1"/><rect x="2" y="16" width="7" height="5" rx="1"/></svg>}
        />

        <div className="hidden 2xl:block">
          <RepairStatusReference
            title="Full Repair Journey"
            guidance="Use this quick lane map while updating jobs so each handoff follows the standard process."
          />
        </div>

        {canUpdatePricing ? (
          <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)] sm:text-[13px]">Pricing Controls</p>
              <p className="mt-0.5 text-xs text-[var(--ink)] sm:text-sm">You can update client pricing directly from job Financials.</p>
            </div>
            <div className="grid gap-2 p-3 grid-cols-2 sm:grid-cols-3">
              <Link href="/jobs?status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center">
                <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--accent)]">Needs Pricing</p>
                <p className="mt-1 text-lg font-semibold text-[var(--accent)]">{pricingPendingCount}</p>
              </Link>
              <Link href="/jobs?status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP,COMPLETED" className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center">
                <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--accent)]">Priced Jobs</p>
                <p className="mt-1 text-lg font-semibold text-[var(--accent)]">{pricedCount}</p>
              </Link>
              <Link href="/jobs?pricing=priced" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-center col-span-2 sm:col-span-1">
                <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Margin</p>
                <p className={`mt-1 text-sm font-semibold ${marginTotal >= 0 ? "text-[var(--accent)]" : "text-red-500"}`}>
                  {marginTotal >= 0 ? "+" : ""}{formatMoneyCompact(marginTotal, getAppCurrency())}
                </p>
              </Link>
            </div>
          </section>
        ) : null}

        <PersistedDisclosure
          title="Recent Assigned Jobs"
          storageKey="dashboard.internal.recentAssigned"
          groupName="mobile-dashboard-sections"
          className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
        >
          {assignedJobs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No assigned jobs yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {assignedJobs.slice(0, 6).map((job) => (
                <li key={job.id} className="border-b border-[var(--line)] pb-1.5 last:border-0 last:pb-0">
                  <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-2 group">
                    <p className="truncate text-xs font-medium text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">{job.jobNumber}</p>
                    <span className="shrink-0 text-[12px] text-[var(--ink-muted)]">
                      {statusLabel[job.status as keyof typeof statusLabel] ?? job.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PersistedDisclosure>

        <div className="hidden gap-3 2xl:grid 2xl:grid-cols-4">
          <Link href="/jobs" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold">{assignedJobs.length}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">View my jobs →</p>
          </Link>
          <Link href="/jobs?status=DIAGNOSING" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Diagnosing ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{diagnosing}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Needs diagnosis work →</p>
          </Link>
          <Link href="/jobs?status=IN_REPAIR" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">In Repair ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{inRepair}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Active repairs →</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed ({selectedPeriodLabel})</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{completed}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Completed repairs →</p>
          </Link>
        </div>

        <div className="panel-shadow hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 2xl:block">
          <p className="mb-2 text-sm font-semibold">Recent Assigned Jobs</p>
          {assignedJobs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No assigned jobs yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {assignedJobs.slice(0, 6).map((job) => (
                <li key={job.id} className="border-b border-[var(--line)] py-2 last:border-0 last:pb-0">
                  <Link href={`/jobs/${job.id}`} className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center group">
                    <p className="truncate font-medium text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">{job.jobNumber} — {[job.device?.brand, job.device?.model].filter(v => v && v !== "Unknown").join(" ") || "Device"}</p>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {statusLabel[job.status as keyof typeof statusLabel] ?? job.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── TECH_MANAGER dashboard ────────────────────────────────────────────────
  if (user.role === "TECH_MANAGER") {
    const today = new Date();
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

    const orgFilter = user.orgId ? { orgId: user.orgId } : {};

    const [
      completedMtd,
      openJobs,
      techWorkloadJobs,
      overdueJobs,
      unassignedCount,
      receivedToday,
      completedToday,
      diagnosingCount,
      partsActivity,
    ] = await Promise.all([
      prisma.job.findMany({
        where: { ...orgFilter, completedAt: { gte: mtdStart }, status: "COMPLETED" },
        select: { completedAt: true, receivedAt: true, assignedTo: { select: { id: true, name: true } } },
      }),
      prisma.job.count({
        where: { ...orgFilter, status: { in: filterSupportedJobStatuses(["RECEIVED","DIAGNOSING","REFERRED","AWAITING_APPROVAL","IN_REPAIR","READY_FOR_PICKUP"]) as JobStatus[] } },
      }),
      prisma.job.findMany({
        where: {
          ...orgFilter,
          status: { in: filterSupportedJobStatuses(["DIAGNOSING","IN_REPAIR","REFERRED","AWAITING_APPROVAL","READY_FOR_PICKUP"]) as JobStatus[] },
          assignedToId: { not: null },
        },
        select: { assignedTo: { select: { id: true, name: true, role: true } } },
      }),
      prisma.job.findMany({
        where: {
          ...orgFilter,
          status: { in: filterSupportedJobStatuses(["RECEIVED","DIAGNOSING","REFERRED","AWAITING_APPROVAL","IN_REPAIR"]) as JobStatus[] },
          receivedAt: { lt: threeDaysAgo },
        },
        select: { id: true, jobNumber: true, status: true, receivedAt: true },
        orderBy: { receivedAt: "asc" },
        take: 8,
      }),
      prisma.job.count({
        where: { ...orgFilter, status: { in: filterSupportedJobStatuses(["RECEIVED","DIAGNOSING","REFERRED","IN_REPAIR"]) as JobStatus[] }, assignedToId: null },
      }),
      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { ...orgFilter, completedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { ...orgFilter, status: "DIAGNOSING" } }),
      prisma.partStockTransaction.findMany({
        where: { createdAt: { gte: mtdStart } },
        select: { type: true, quantity: true },
      }).catch(() => [] as Array<{ type: string; quantity: number }>),
    ]);

    // Compute tech workload map
    const techMap = new Map<string, { id: string; name: string; role: string; count: number }>();
    for (const j of techWorkloadJobs) {
      if (!j.assignedTo) continue;
      const e = techMap.get(j.assignedTo.id) ?? { ...j.assignedTo, count: 0 };
      e.count += 1;
      techMap.set(j.assignedTo.id, e);
    }
    const techRows = [...techMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    // Compute per-tech completions this month
    const techCompletions = new Map<string, { name: string; count: number; avgDays: number; totalDays: number }>();
    for (const j of completedMtd) {
      if (!j.assignedTo) continue;
      const e = techCompletions.get(j.assignedTo.id) ?? { name: j.assignedTo.name, count: 0, avgDays: 0, totalDays: 0 };
      const days = j.completedAt && j.receivedAt ? (new Date(j.completedAt).getTime() - new Date(j.receivedAt).getTime()) / 86400000 : 0;
      e.count += 1;
      e.totalDays += days;
      e.avgDays = e.totalDays / e.count;
      techCompletions.set(j.assignedTo.id, e);
    }
    const topTechs = [...techCompletions.values()].sort((a, b) => b.count - a.count).slice(0, 6);

    // Avg turnaround for completed MTD
    const avgTurnaround = completedMtd.length > 0
      ? completedMtd.reduce((sum, j) => {
          if (!j.completedAt || !j.receivedAt) return sum;
          return sum + (new Date(j.completedAt).getTime() - new Date(j.receivedAt).getTime()) / 86400000;
        }, 0) / completedMtd.length
      : 0;

    const partsConsumed = partsActivity.filter(p => p.type === "OUT").reduce((s, p) => s + p.quantity, 0);
    const overdueWithDays = overdueJobs.map(j => ({ ...j, ageDays: Math.floor((today.getTime() - new Date(j.receivedAt).getTime()) / 86400000) }));

    const trendMonths = trendMonthsSinceStartOfYear(today);
    const repairTrend = await loadRepairRevenueTrend(trendMonths, user.orgId);
    const currency = getAppCurrency();

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Tech Operations"
          summary={`${receivedToday} in · ${completedToday} out today · ${overdueWithDays.length} overdue · avg ${avgTurnaround.toFixed(1)}d turnaround`}
          primaryHref="/jobs"
          primaryLabel="All Jobs"
          secondaryHref="/technicians"
          secondaryLabel="Technicians"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
        />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Completed MTD", val: String(completedMtd.length), sub: `avg ${avgTurnaround.toFixed(1)}d turnaround`, href: "/jobs?status=COMPLETED", color: "text-emerald-600" },
            { label: "Open Jobs", val: String(openJobs), sub: `${diagnosingCount} diagnosing`, href: "/jobs", color: "text-[var(--ink)]" },
            { label: "Overdue (3d+)", val: String(overdueWithDays.length), sub: `${unassignedCount} unassigned`, href: "/jobs", color: overdueWithDays.length > 0 ? "text-amber-600" : "text-[var(--ink-muted)]" },
            { label: "Parts Used MTD", val: String(partsConsumed), sub: "units consumed", href: "/inventory", color: "text-[var(--ink)]" },
          ].map(t => (
            <Link key={t.label} href={t.href} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px]">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">{t.label}</p>
              <p className={`mt-1 text-[15px] font-black leading-tight ${t.color}`}>{t.val}</p>
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{t.sub}</p>
            </Link>
          ))}
        </div>

        {/* Attention banner */}
        {(overdueWithDays.length > 0 || unassignedCount > 0) && (
          <section className="panel-shadow rounded-xl border border-[var(--accent)]/25 bg-[var(--panel)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Attention Required</span>
              {unassignedCount > 0 && <Link href="/jobs?assignedToId=unassigned" className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink)]">{unassignedCount} unassigned</Link>}
              {overdueWithDays.length > 0 && <span className="rounded-full border border-white/10 bg-[#0b0b0b] px-2.5 py-1 text-[13px] font-medium text-white/90">{overdueWithDays.length} overdue 3+ days</span>}
            </div>
          </section>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Technician completions leaderboard */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completions This Month</p>
            {topTechs.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No completed jobs this month.</p>
            ) : (
              <div className="space-y-1.5">
                {topTechs.map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-bold text-[var(--ink-muted)] w-4">{i + 1}</span>
                      <p className="truncate text-xs font-semibold text-[var(--ink)]">{t.name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] text-[var(--ink-muted)]">{t.avgDays.toFixed(1)}d avg</span>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-bold text-emerald-600">{t.count} done</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active workload */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5" id="tech-workload">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Active Workload</p>
              {unassignedCount > 0 && <Link href="/jobs?assignedToId=unassigned" className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[12px] font-bold text-amber-600">{unassignedCount} unassigned</Link>}
            </div>
            {techRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No active assignments.</p>
            ) : (
              <div className="space-y-1.5">
                {techRows.map(t => (
                  <Link key={t.id} href={`/jobs?assignedToId=${t.id}`} className="group flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/35">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold group-hover:text-[var(--accent)] transition-colors">{t.name}</p>
                      <p className="text-[12px] text-[var(--ink-muted)]">{t.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"}</p>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${t.role === "TECHNICIAN_EXTERNAL" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/15 text-sky-500"}`}>{t.count} active</span>
                  </Link>
                ))}
                {overdueWithDays.length > 0 && (
                  <div className="mt-2 border-t border-[var(--line)] pt-2">
                    <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Overdue Jobs</p>
                    {overdueWithDays.slice(0, 4).map(j => (
                      <Link key={j.id} href={`/jobs/${j.id}`} className="mb-1 flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-amber-500/30">
                        <p className="mono truncate text-xs font-bold text-[var(--accent)]">{j.jobNumber}</p>
                        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${j.ageDays >= 8 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-600"}`}>{j.ageDays}d</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={repairTrend} currency={currency} label="Repair Revenue & Margin Trend" emptyMessage="No completed repair jobs yet for this period." />
      </div>
    );
  }

  if (user.role === "ADMIN") {
    const currency = getAppCurrency();
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const yesterdayEnd = new Date(todayStart.getTime() - 1);
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const orgFilter = user.orgId ? { orgId: user.orgId } : {};
    // Compute trend months upfront so we can include trend query in the main batch
    const trendMonths = trendMonthsSinceStartOfYear(today);

    const [
      statusGroup,
      // Stream 1: Repairs MTD
      completedMtdJobs,
      // Financial position
      bankAccounts,
      expensesMtd,
      payablesAgg,
      // Operations
      awaitingApprovalCount,
      receivedToday,
      completedToday,
      receivedMtdCount,
      expensesToday,
      overdueJobsCount,
      jobsNoClientUpdateCount,
      completedUnpaidCount,
      payoutDueJobs,
      // Sales funnel
      leadFunnel,
      // Stock alerts
      lowStockParts,
      // Tech leaderboard
      techCompletedMtd,
      // Tech pending jobs (all active statuses)
      techPendingJobs,
      // Yesterday comparison
      receivedYesterday,
      completedYesterday,
      expensesYesterdayRaw,
      // Per-tech payout due
      techPayoutByTech,
      // Intake queue
      intakePendingCount,
      // Comms health
      failedOutboxCount,
      // Inventory: out-of-stock
      outOfStockCount,
      // Cash collections — single wide MTD fetch, sliced in memory (2 queries not 6)
      collectionsWide,
      receivables,
      // YTD revenue trend — merged from former serial await
      revenueTrend,
      // Org modules — merged from former serial await
      enabledModules,
      // Org name for mobile header — merged from former inline JSX query
      orgName,
    ] = await Promise.all([
      prisma.job.groupBy({ by: ["status"], where: orgFilter, _count: { status: true } }),

      prisma.job.findMany({
        where: { ...orgFilter, status: "COMPLETED", completedAt: { gte: mtdStart, lte: today } },
        select: { clientBill: true },
      }),

      prisma.bankAccount.findMany({
        where: { ...orgFilter, isActive: true },
        select: { name: true, currentBalance: true },
        orderBy: { currentBalance: "desc" },
      }).catch(() => [] as { name: string; currentBalance: number }[]),

      prisma.expense.findMany({
        where: { orgId: orgFilter.orgId ?? undefined, paidAt: { gte: mtdStart, lte: today } },
        select: { amount: true },
      }).catch(() => [] as { amount: number }[]),

      prisma.supplierBill.aggregate({
        where: { ...orgFilter, status: { in: ["POSTED", "PART_PAID"] } },
        _sum: { totalAmount: true, paidAmount: true },
      }).catch(() => ({ _sum: { totalAmount: null, paidAmount: null } })),

      prisma.job.count({ where: { ...orgFilter, status: "AWAITING_APPROVAL" } }).catch(() => 0),

      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { ...orgFilter, completedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: mtdStart, lte: today } } }),

      prisma.expense.findMany({ where: { orgId: orgFilter.orgId ?? undefined, paidAt: { gte: todayStart } }, select: { amount: true } }).catch(() => [] as { amount: number }[]),
      prisma.job.count({ where: { ...orgFilter, status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] }, receivedAt: { lt: new Date(today.getTime() - 3 * 86_400_000) } } }).catch(() => 0),
      prisma.job.count({ where: { ...orgFilter, status: { in: filterSupportedJobStatuses(["DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] }, lastClientContactAt: null } }).catch(() => 0),
      prisma.job.count({ where: { ...orgFilter, status: "COMPLETED", clientBill: { gt: 0 }, clientPaid: false } }).catch(() => 0),
      prisma.job.findMany({ where: { ...orgFilter, repairPath: "EXTERNAL", status: { in: ["COMPLETED", "DELIVERED"] }, externalPaid: false }, select: { externalTechFee: true, externalTechBill: true } }).catch(() => [] as { externalTechFee: number | null; externalTechBill: number | null }[]),

      prisma.lead.groupBy({ by: ["status"], where: orgFilter, _count: { status: true } }).catch(() => [] as { status: string; _count: { status: number } }[]),

      prisma.part.findMany({
        where: { ...orgFilter, isActive: true, reorderLevel: { gt: 0 } },
        select: { id: true, name: true, sku: true, qtyOnHand: true, reorderLevel: true },
      }).catch(() => [] as { id: string; name: string; sku: string; qtyOnHand: number; reorderLevel: number }[]),

      prisma.job.findMany({
        where: { ...orgFilter, status: "COMPLETED", completedAt: { gte: mtdStart }, assignedToId: { not: null } },
        select: { assignedToId: true, assignedTo: { select: { name: true } }, clientBill: true, receivedAt: true, completedAt: true },
      }).catch(() => [] as { assignedToId: string | null; assignedTo: { name: string } | null; clientBill: number | null; receivedAt: Date; completedAt: Date | null }[]),

      // Tech pending jobs — groupBy to get counts without loading every job row
      prisma.job.groupBy({
        by: ["assignedToId"],
        where: { ...orgFilter, status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] }, assignedToId: { not: null } },
        _count: { assignedToId: true },
      }).catch(() => [] as { assignedToId: string | null; _count: { assignedToId: number } }[]),

      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: yesterdayStart, lte: yesterdayEnd } } }).catch(() => 0),
      prisma.job.count({ where: { ...orgFilter, completedAt: { gte: yesterdayStart, lte: yesterdayEnd } } }).catch(() => 0),
      prisma.expense.findMany({ where: { orgId: orgFilter.orgId ?? undefined, paidAt: { gte: yesterdayStart, lte: yesterdayEnd } }, select: { amount: true } }).catch(() => [] as { amount: number }[]),
      prisma.job.findMany({ where: { ...orgFilter, repairPath: "EXTERNAL", status: { in: filterSupportedJobStatuses(["COMPLETED", "DELIVERED"]) as JobStatus[] }, externalPaid: false, assignedToId: { not: null } }, select: { assignedToId: true, externalTechFee: true, externalTechBill: true } }).catch(() => [] as { assignedToId: string | null; externalTechFee: number | null; externalTechBill: number | null }[]),
      // Intake pending
      prisma.repairRequest.count({ where: { ...(orgFilter.orgId ? { orgId: orgFilter.orgId } : {}), requestStatus: { in: ["PENDING_INTAKE", "PENDING_FRONT_DESK"] as never[] } } }).catch(() => 0),
      // Failed / dead outbox messages
      prisma.outboundMessage.count({ where: { ...(orgFilter.orgId ? { orgId: orgFilter.orgId } : {}), status: { in: ["FAILED", "DEAD"] as never[] } } }).catch(() => 0),
      // Out-of-stock active parts
      prisma.part.count({ where: { ...orgFilter, isActive: true, qtyOnHand: { lte: 0 } } }).catch(() => 0),
      // Cash collections — single wide MTD fetch, sliced into today/yesterday/MTD in memory (2 queries not 6)
      user.orgId
        ? loadCashCollectionsByChannelWide({ orgId: user.orgId, baseCurrency: currency, mtdStart, todayStart, yesterdayStart, yesterdayEnd })
        : Promise.resolve({ mtd: { repairs: 0, products: 0, corporate: 0, unallocated: 0, total: 0 }, today: { repairs: 0, products: 0, corporate: 0, unallocated: 0, total: 0 }, yesterday: { repairs: 0, products: 0, corporate: 0, unallocated: 0, total: 0 } }),
      user.orgId
        ? loadReceivablesTotal(user.orgId)
        : Promise.resolve({ invoiceBalance: 0, saleBalance: 0, total: 0, invoiceCount: 0, saleCount: 0 }),
      // YTD revenue trend — now parallel
      user.orgId
        ? loadTotalRevenueTrend(trendMonths, user.orgId, currency).catch(() => trendMonths.map((m) => ({ key: m.key, revenue: 0, margin: 0 })))
        : Promise.resolve(trendMonths.map((m) => ({ key: m.key, revenue: 0, margin: 0 }))),
      // Org modules — now parallel
      user.orgId
        ? getOrgModules(user.orgId).catch(() => new Set(["JOBS", "INVOICING", "POS"]) as Set<string>)
        : Promise.resolve(new Set(["JOBS", "INVOICING", "POS"]) as Set<string>),
      // Org name for mobile header — lifted out of inline JSX
      user.orgId
        ? prisma.organization.findUnique({ where: { id: user.orgId }, select: { name: true } }).then(o => o?.name ?? null).catch(() => null)
        : Promise.resolve(null as string | null),
    ]);

    // Unpack wide collections result
    const collectionsMtd       = collectionsWide.mtd;
    const collectionsToday     = collectionsWide.today;
    const collectionsYesterday = collectionsWide.yesterday;

    // Revenue stream totals
    const repairsMtd   = collectionsMtd.repairs;
    const productsMtd  = collectionsMtd.products;
    const corporateMtd = collectionsMtd.corporate + collectionsMtd.unallocated;
    const totalMtd     = collectionsMtd.total;
    const conversionRate = receivedMtdCount > 0 ? Math.round(completedMtdJobs.length / receivedMtdCount * 100) : 0;

    // Financial position
    const totalBankBalance  = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);
    const outstandingValue  = receivables.total;
    const outstandingCount  = receivables.invoiceCount + receivables.saleCount;
    const expensesValue     = expensesMtd.reduce((s, e) => s + e.amount, 0);
    const cashTodayValue    = collectionsToday.total;
    const salesTodayValue   = collectionsToday.products;
    const revenueTodayValue = collectionsToday.total;
    const expensesTodayValue = expensesToday.reduce((s, e) => s + e.amount, 0);
    const payablesValue     = (payablesAgg._sum.totalAmount ?? 0) - (payablesAgg._sum.paidAmount ?? 0);
    const technicianPayoutsDue = payoutDueJobs.reduce((sum, job) => sum + resolveTechCost(job.externalTechFee, job.externalTechBill), 0);

    // Yesterday comparison values
    const cashYesterdayValue = collectionsYesterday.total;
    const expensesYesterdayValue = expensesYesterdayRaw.reduce((s, e) => s + e.amount, 0);

    // Per-tech payout due map
    const techPayoutDueMap = new Map<string, number>();
    for (const j of techPayoutByTech) {
      if (!j.assignedToId) continue;
      techPayoutDueMap.set(j.assignedToId, (techPayoutDueMap.get(j.assignedToId) ?? 0) + resolveTechCost(j.externalTechFee, j.externalTechBill));
    }

    // Low stock
    const lowStockItems = lowStockParts.filter((p) => p.qtyOnHand <= p.reorderLevel);
    const quickActions = [
      can.createJob(permissionUser) && enabledModules.has("JOBS") && {
        href: "/jobs/new",
        label: "New Job",
        bg: "bg-[var(--accent)]",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
      },
      can.viewFinancials(permissionUser) && enabledModules.has("INVOICING") && {
        href: "/documents/receipts",
        label: "Collect",
        bg: "bg-emerald-500/15",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      },
      can.openPosSession(permissionUser) && enabledModules.has("POS") && {
        href: "/pos",
        label: "Sale",
        bg: "bg-violet-500/15",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
      },
      can.viewFinancials(permissionUser) && enabledModules.has("INVOICING") && {
        href: "/documents/invoices",
        label: "Invoice",
        bg: "bg-amber-500/15",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
      },
    ].filter(Boolean) as React.ComponentProps<typeof MobileHomeDashboard>["quickActions"];

    // Tech leaderboard — techPendingJobs is now a groupBy result (one row per tech)
    const techPendingMap = new Map<string, number>();
    for (const row of techPendingJobs) {
      if (!row.assignedToId) continue;
      techPendingMap.set(row.assignedToId, row._count.assignedToId);
    }
    const techMap = new Map<string, { name: string; count: number; pending: number; revenue: number; totalDays: number; payoutDue: number }>();
    for (const j of techCompletedMtd) {
      if (!j.assignedToId || !j.assignedTo) continue;
      const e = techMap.get(j.assignedToId) ?? { name: j.assignedTo.name, count: 0, pending: techPendingMap.get(j.assignedToId) ?? 0, revenue: 0, totalDays: 0, payoutDue: techPayoutDueMap.get(j.assignedToId) ?? 0 };
      e.count += 1;
      e.revenue += getClientBill(j) ?? 0;
      if (j.completedAt) e.totalDays += Math.round((new Date(j.completedAt).getTime() - new Date(j.receivedAt).getTime()) / 86_400_000);
      techMap.set(j.assignedToId, e);
    }
    const techLeaderboard = [...techMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    // Status pipeline
    const statusCount = new Map<string, number>();
    for (const item of statusGroup) {
      const key = normalizeJobStatus(item.status as JobStatus);
      statusCount.set(key, (statusCount.get(key) ?? 0) + item._count.status);
    }
    // Mobile-specific derived counts
    const inRepairCount      = statusCount.get("IN_REPAIR") ?? 0;
    const readyForPickupCount = statusCount.get("READY_FOR_PICKUP") ?? 0;
    const statusData = UI_JOB_STATUSES.map((status) => ({
      key: status, name: statusLabel[status], value: statusCount.get(status) ?? 0,
    }));

    // Sales funnel counts
    const leadCountMap = new Map<string, number>();
    for (const row of leadFunnel) leadCountMap.set(row.status, row._count.status);
    const LEAD_STAGES = [
      { key: "NEW",           name: "New",           color: "text-[var(--ink)]",  href: "/sales/leads?status=NEW" },
      { key: "CONTACTED",     name: "Contacted",      color: "text-sky-500",       href: "/sales/leads?status=CONTACTED" },
      { key: "QUALIFIED",     name: "Qualified",      color: "text-violet-500",    href: "/sales/leads?status=QUALIFIED" },
      { key: "PROPOSAL_SENT", name: "Proposal Sent",  color: "text-amber-500",     href: "/sales/leads?status=PROPOSAL_SENT" },
      { key: "WON",           name: "Won",            color: "text-emerald-600",   href: "/sales/leads?status=WON" },
      { key: "LOST",          name: "Lost",           color: "text-red-500",       href: "/sales/leads?status=LOST" },
      { key: "STALE",         name: "Stale",          color: "text-[var(--ink-muted)]", href: "/sales/leads?status=STALE" },
    ] as const;
    return (
      <div className="space-y-4">

        {/* ── Mobile home screen (Airtel Money-inspired, hidden on desktop) ── */}
        <MobileHomeDashboard
          userName={user.name}
          orgName={orgName ?? "Dduuka ProMax"}
          receivedToday={receivedToday}
          completedToday={completedToday}
          inRepairCount={inRepairCount}
          readyForPickupCount={readyForPickupCount}
          awaitingApprovalCount={awaitingApprovalCount}
          receivedCount={statusCount.get("RECEIVED") ?? 0}
          overdueCount={overdueJobsCount}
          completedUnpaidCount={completedUnpaidCount}
          cashTodayValue={cashTodayValue}
          cashYesterdayValue={cashYesterdayValue}
          salesTodayValue={salesTodayValue}
          revenueTodayValue={revenueTodayValue}
          outstandingValue={outstandingValue}
          revenueMtd={totalMtd}
          currency={currency}
          quickActions={quickActions}
        />

        {/* ── Desktop dashboard starts here (hidden on mobile) ── */}

        {/* ── Quick action bar — left-aligned, compact ── */}
        <div className="hidden lg:flex items-center gap-2">
          <Link href="/jobs/new" className="btn-premium inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold">
            + New Job
          </Link>
          {[
            { href: "/intake",           label: "New Intake" },
            { href: "/pos",              label: "Record Sale" },
            { href: "/finance/expenses", label: "Add Expense" },
            { href: "/reports",          label: "Reports" },
          ].map((a) => (
            <Link key={a.href} href={a.href}
              className="inline-flex items-center rounded-lg border border-[var(--line)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
              {a.label}
            </Link>
          ))}
        </div>

        {/* ── Today at a Glance — compact 6-chip strip (desktop only) ── */}
        <div className="hidden lg:grid lg:grid-cols-6 gap-2">
          {([
            { label: "Jobs In",      value: String(receivedToday),                          delta: `↕ ${receivedYesterday} yest`,   href: "/jobs?status=RECEIVED",             tone: "text-[var(--ink)]",     accent: "border-l-sky-500" },
            { label: "Completed",    value: String(completedToday),                         delta: `↕ ${completedYesterday} yest`,  href: "/jobs?status=COMPLETED",            tone: "text-emerald-600",      accent: "border-l-emerald-500" },
            { label: "Intake Queue", value: String(intakePendingCount),                     delta: intakePendingCount > 0 ? "Action needed" : "Queue clear", href: "/intake",  tone: intakePendingCount > 0 ? "text-orange-500" : "text-[var(--ink-muted)]", accent: intakePendingCount > 0 ? "border-l-orange-500" : "border-l-[var(--line)]" },
            { label: "Cash Today",   value: formatMoneyCompact(cashTodayValue, currency),   delta: `↕ ${formatMoneyCompact(cashYesterdayValue, currency)}`,   href: "/documents/receipts",               tone: "text-violet-600",       accent: "border-l-violet-500" },
            { label: "Expenses",     value: formatMoneyCompact(expensesTodayValue, currency), delta: `↕ ${formatMoneyCompact(expensesYesterdayValue, currency)}`, href: "/finance/expenses",              tone: expensesTodayValue > 0 ? "text-red-500" : "text-[var(--ink-muted)]", accent: "border-l-red-400" },
            { label: "Balances Due", value: formatMoneyCompact(outstandingValue, currency), delta: `${completedUnpaidCount} unpaid`, href: "/documents/invoices?status=ISSUED", tone: outstandingValue > 0 ? "text-amber-600" : "text-[var(--ink-muted)]", accent: "border-l-amber-500" },
          ] as const).map((kpi) => (
            <Link key={kpi.label} href={kpi.href}
              className={`panel-shadow flex flex-col gap-0.5 rounded-xl border border-[var(--line)] border-l-2 ${kpi.accent} bg-[var(--panel)] px-3 py-2.5 transition hover:bg-[var(--panel-strong)]`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">{kpi.label}</p>
              <p className={`text-[18px] font-black leading-tight tabular-nums ${kpi.tone}`}>{kpi.value}</p>
              <p className="text-[11px] text-[var(--ink-muted)]/70">{kpi.delta}</p>
            </Link>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
             MAIN 3-COLUMN GRID — Left: Revenue+Finance  |  Centre: Action+Pipeline  |  Right: Actions+Sales+Ops
             ══════════════════════════════════════════════════════════ */}
        <div className="grid gap-3 lg:grid-cols-3 lg:items-stretch">

          {/* ── LEFT COLUMN: Revenue + Financial Position ── */}
          <div className="flex flex-col gap-3">

            {/* Revenue MTD */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Revenue <span className="font-normal text-[var(--ink-muted)]">· {monthLabel(today.getFullYear(), today.getMonth() + 1)}</span>
                </p>
                <Link href="/reports" className="text-[12px] font-semibold text-[var(--accent)]">Reports →</Link>
              </div>
              {/* Channels — vertical list for 1/3 column */}
              <div className="divide-y divide-[var(--line)]">
                {([
                  { label: "Repairs",   value: repairsMtd,   pct: totalMtd > 0 ? Math.round(repairsMtd / totalMtd * 100) : 0,   bar: "bg-sky-500",     num: "text-sky-600",     href: "/jobs?status=COMPLETED" },
                  { label: "Products",  value: productsMtd,  pct: totalMtd > 0 ? Math.round(productsMtd / totalMtd * 100) : 0,  bar: "bg-violet-500",  num: "text-violet-600",  href: "/pos" },
                  { label: "Corporate", value: corporateMtd, pct: totalMtd > 0 ? Math.round(corporateMtd / totalMtd * 100) : 0, bar: "bg-emerald-500", num: "text-emerald-600", href: "/documents/invoices" },
                ] as const).map((s) => (
                  <Link key={s.label} href={s.href} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--panel-strong)]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${s.bar}`} />
                    <p className="flex-1 text-[13px] text-[var(--ink-muted)]">{s.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-[14px] font-black tabular-nums ${s.num}`}>{formatMoneyCompact(s.value, currency)}</p>
                      <p className="w-8 text-right text-[11px] text-[var(--ink-muted)]">{s.pct}%</p>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Progress bars */}
              <div className="px-4 pb-3 pt-1">
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                  {[
                    { w: totalMtd > 0 ? Math.round(repairsMtd / totalMtd * 100) : 33,   c: "bg-sky-500" },
                    { w: totalMtd > 0 ? Math.round(productsMtd / totalMtd * 100) : 33,  c: "bg-violet-500" },
                    { w: totalMtd > 0 ? Math.round(corporateMtd / totalMtd * 100) : 34, c: "bg-emerald-500" },
                  ].map((seg, i) => <div key={i} className={`${seg.c} rounded-sm opacity-80`} style={{ width: `${seg.w}%` }} />)}
                </div>
              </div>
              {/* Total */}
              <Link href="/reports" className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--accent)]/6 px-4 py-2.5 transition hover:bg-[var(--accent)]/10">
                <p className="text-[12px] font-semibold text-[var(--ink)]">Total this month</p>
                <p className="text-[16px] font-black tabular-nums text-[var(--accent)]">{formatMoneyCompact(totalMtd, currency)}</p>
              </Link>
            </section>

            {/* Financial Position */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[var(--ink)]">Financial position</p>
                <Link href="/reports" className="text-[12px] font-semibold text-[var(--accent)]">Reports →</Link>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {([
                  { dot: "bg-sky-500",     label: "Cash & bank",         sub: `${bankAccounts.length} account${bankAccounts.length !== 1 ? "s" : ""}`,                                                                          value: totalBankBalance,          tone: "text-[var(--ink)]",                                                  href: "/finance/bank" },
                  { dot: "bg-amber-500",   label: "Receivables",         sub: `${outstandingCount} open`,                                                                                                                         value: outstandingValue,          tone: outstandingValue > 0 ? "text-amber-600" : "text-[var(--ink)]",      href: "/documents/invoices?status=ISSUED" },
                  { dot: "bg-red-400",     label: "Payables",            sub: "to suppliers",                                                                                                                                     value: payablesValue,             tone: payablesValue > 0 ? "text-red-500" : "text-[var(--ink)]",          href: "/inventory/supplier-bills?status=POSTED" },
                  { dot: "bg-rose-500",    label: "Expenses MTD",        sub: null,                                                                                                                                               value: expensesValue,             tone: "text-red-600",                                                     href: "/finance/expenses" },
                  { dot: "bg-emerald-500", label: "Gross margin",        sub: `${totalMtd > 0 ? Math.round((totalMtd - expensesValue) / totalMtd * 100) : 0}% margin`,                                                          value: totalMtd - expensesValue,  tone: (totalMtd - expensesValue) >= 0 ? "text-emerald-600" : "text-red-500", href: "/reports" },
                  { dot: "bg-amber-400",   label: "Tech payouts due",    sub: `${payoutDueJobs.length} pending`,                                                                                                                  value: technicianPayoutsDue,      tone: technicianPayoutsDue > 0 ? "text-amber-600" : "text-[var(--ink)]", href: "/jobs?repairPath=EXTERNAL" },
                ] as const).map((item) => (
                  <Link key={item.label} href={item.href} className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-[var(--panel-strong)]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-[var(--ink)]">{item.label}</p>
                      {item.sub && <p className="text-[11px] text-[var(--ink-muted)]">{item.sub}</p>}
                    </div>
                    <p className={`shrink-0 text-[13px] font-bold tabular-nums ${item.tone}`}>{formatMoneyCompact(item.value, currency)}</p>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                  </Link>
                ))}
              </div>
            </section>

            {/* Bank Accounts — always rendered with flex-1 to fill remaining left-column height */}
            {(() => {
              const totalCash = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);
              return (
                <section className="panel-shadow flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                    <p className="text-sm font-semibold text-[var(--ink)]">Bank accounts</p>
                    <Link href="/finance/bank" className="text-[12px] font-semibold text-[var(--accent)]">View →</Link>
                  </div>
                  {bankAccounts.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/40"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h2"/><path d="M12 15h5"/></svg>
                      <p className="text-[12px] text-[var(--ink-muted)]">No bank accounts linked</p>
                      <Link href="/finance/bank" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">Add account →</Link>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-[var(--line)]">
                        {bankAccounts.map((acct) => {
                          const pct = totalCash > 0 ? Math.round((acct.currentBalance / totalCash) * 100) : 0;
                          const isPositive = acct.currentBalance >= 0;
                          return (
                            <Link key={acct.name} href="/finance/bank"
                              className="flex flex-col gap-1.5 px-4 py-2.5 transition hover:bg-[var(--panel-strong)]">
                              <div className="flex items-center justify-between">
                                <p className="text-[12px] font-medium text-[var(--ink)] truncate max-w-[55%]">{acct.name}</p>
                                <p className={`text-[13px] font-black tabular-nums ${isPositive ? "text-[var(--ink)]" : "text-red-500"}`}>
                                  {formatMoneyCompact(acct.currentBalance, currency)}
                                </p>
                              </div>
                              {/* Share-of-total bar */}
                              <div className="flex items-center gap-2">
                                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--panel-strong)]">
                                  <div className={`h-full rounded-full ${isPositive ? "bg-sky-500" : "bg-red-400"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                                </div>
                                <span className="shrink-0 text-[10px] text-[var(--ink-muted)]">{pct}%</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                      {/* Total cash row */}
                      <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2">
                        <p className="text-[11px] font-semibold text-[var(--ink-muted)]">Total cash</p>
                        <p className={`text-[13px] font-black tabular-nums ${totalCash >= 0 ? "text-sky-600" : "text-red-500"}`}>{formatMoneyCompact(totalCash, currency)}</p>
                      </div>
                    </>
                  )}
                </section>
              );
            })()}

          </div>{/* end left column */}

          {/* ── CENTRE COLUMN: Needs Action + Repair Pipeline ── */}
          <div className="flex flex-col gap-3">

            {/* Needs Action */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[var(--ink)]">Needs action</p>
                <Link href="/jobs" className="text-[12px] font-semibold text-[var(--accent)]">All jobs →</Link>
              </div>
              {/* 3 big-number urgency tiles */}
              <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
                {([
                  { count: awaitingApprovalCount, label: "Awaiting\napproval", numColor: awaitingApprovalCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]/30", bg: awaitingApprovalCount > 0 ? "bg-[var(--accent)]/6" : "", href: "/jobs?status=AWAITING_APPROVAL" },
                  { count: readyForPickupCount,   label: "Ready for\npickup",  numColor: readyForPickupCount > 0 ? "text-emerald-600" : "text-[var(--ink-muted)]/30",       bg: readyForPickupCount > 0 ? "bg-emerald-500/6" : "",        href: "/jobs?status=READY_FOR_PICKUP" },
                  { count: overdueJobsCount,      label: "Overdue",            numColor: overdueJobsCount > 0 ? "text-red-500" : "text-[var(--ink-muted)]/30",              bg: overdueJobsCount > 0 ? "bg-red-500/6" : "",               href: "/jobs?status=RECEIVED,DIAGNOSING,REFERRED,IN_EXTERNAL_REPAIR,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" },
                ] as const).map((card) => (
                  <Link key={card.label} href={card.href}
                    className={`flex flex-col items-center gap-0.5 px-2 py-3.5 text-center transition hover:bg-[var(--panel-strong)] ${card.bg}`}>
                    <p className={`text-[30px] font-black leading-none tabular-nums ${card.numColor}`}>{card.count}</p>
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-tight text-[var(--ink-muted)]">{card.label}</p>
                  </Link>
                ))}
              </div>
              {/* Alert rows — only those with data */}
              {(completedUnpaidCount > 0 || jobsNoClientUpdateCount > 0 || intakePendingCount > 0 || failedOutboxCount > 0) && (
                <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {intakePendingCount > 0 && (
                    <Link href="/intake" className="flex items-center justify-between px-4 py-2 transition hover:bg-[var(--panel-strong)]">
                      <p className="text-[12px] text-[var(--ink-muted)]"><span className="font-bold text-orange-500">{intakePendingCount}</span> awaiting intake</p>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                    </Link>
                  )}
                  {completedUnpaidCount > 0 && (
                    <Link href="/jobs?status=COMPLETED" className="flex items-center justify-between px-4 py-2 transition hover:bg-[var(--panel-strong)]">
                      <p className="text-[12px] text-[var(--ink-muted)]"><span className="font-bold text-red-500">{completedUnpaidCount}</span> completed unpaid</p>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                    </Link>
                  )}
                  {jobsNoClientUpdateCount > 0 && (
                    <Link href="/jobs" className="flex items-center justify-between px-4 py-2 transition hover:bg-[var(--panel-strong)]">
                      <p className="text-[12px] text-[var(--ink-muted)]"><span className="font-bold text-amber-600">{jobsNoClientUpdateCount}</span> no client update</p>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                    </Link>
                  )}
                  {failedOutboxCount > 0 && (
                    <Link href="/settings/notifications/outbox" className="flex items-center justify-between px-4 py-2 transition hover:bg-[var(--panel-strong)]">
                      <p className="text-[12px] text-[var(--ink-muted)]"><span className="font-bold text-rose-500">{failedOutboxCount}</span> messages failed</p>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                    </Link>
                  )}
                </div>
              )}
            </section>

            {/* Repair Pipeline */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] px-4 py-2.5 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Repair pipeline
                  {conversionRate > 0 && <span className="ml-1.5 text-[12px] font-normal text-[var(--ink-muted)]">· {conversionRate}% conv.</span>}
                </p>
                <Link href="/jobs" className="text-[12px] font-semibold text-[var(--accent)]">View →</Link>
              </div>
              {(() => {
                const STAGES = [
                  { key: "RECEIVED",          name: "Received",   tone: (v: number) => v > 0 ? "text-sky-600"         : "text-[var(--ink-muted)]/30" },
                  { key: "DIAGNOSING",        name: "Diagnosing", tone: (v: number) => v > 0 ? "text-blue-600"        : "text-[var(--ink-muted)]/30" },
                  { key: "AWAITING_APPROVAL", name: "Awaiting",   tone: (v: number) => v > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]/30" },
                  { key: "IN_REPAIR",         name: "In repair",  tone: (v: number) => v > 0 ? "text-violet-600"      : "text-[var(--ink-muted)]/30" },
                  { key: "READY_FOR_PICKUP",  name: "Ready",      tone: (v: number) => v > 0 ? "text-emerald-600"     : "text-[var(--ink-muted)]/30" },
                  { key: "COMPLETED",         name: "Completed",  tone: (v: number) => v > 0 ? "text-emerald-600"     : "text-[var(--ink-muted)]/30" },
                ] as const;
                return (
                  <div className="grid grid-cols-3 divide-x divide-y divide-[var(--line)]">
                    {STAGES.map(({ key, name, tone }) => {
                      const count = statusData.find(s => s.key === key)?.value ?? 0;
                      return (
                        <Link key={key} href={`/jobs?status=${key}`}
                          className="flex flex-col items-center gap-0.5 py-4 transition hover:bg-[var(--panel-strong)]">
                          <p className={`text-[24px] font-black leading-none tabular-nums ${tone(count)}`}>{count}</p>
                          <p className="text-[11px] text-[var(--ink-muted)]">{name}</p>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}
            </section>

            {/* YTD — always all 12 months, fixed-height rows, no scroll */}
            {(() => {
              // Build a full Jan-Dec array regardless of how many months have data
              const year = today.getFullYear();
              const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const full12 = MON.map((label, idx) => {
                const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
                const found = revenueTrend.find(m => m.key === key);
                return { label, key, revenue: found?.revenue ?? 0, margin: found?.margin ?? 0, future: !found };
              });
              const maxRev    = Math.max(...full12.map(m => m.revenue), 1);
              const ytdTotal  = full12.reduce((s, m) => s + m.revenue, 0);
              const ytdMargin = full12.reduce((s, m) => s + m.margin,  0);
              const peakIdx   = full12.reduce((b, m, i) => m.revenue > full12[b].revenue ? i : b, 0);
              if (ytdTotal === 0) return null;
              return (
                <section className="panel-shadow flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                  {/* YTD summary header */}
                  <div className="grid grid-cols-2 divide-x divide-[var(--line)] border-b border-[var(--line)]">
                    <div className="px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">YTD Revenue</p>
                      <p className="text-[14px] font-black tabular-nums leading-tight text-[var(--accent)]">{formatMoneyCompact(ytdTotal, currency)}</p>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-muted)]">YTD Margin</p>
                      <p className={`text-[14px] font-black tabular-nums leading-tight ${ytdMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatMoneyCompact(ytdMargin, currency)}</p>
                    </div>
                  </div>
                  {/* Col headings */}
                  <div className="grid grid-cols-[1.8rem_1fr_2.5rem] items-center border-b border-[var(--line)] px-3 py-[3px]">
                    <span className="text-[8.5px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Mo</span>
                    <span className="text-[8.5px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Rev · Margin</span>
                    <span className="text-right text-[8.5px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Mg%</span>
                  </div>
                  {/* 12 rows — fixed height, scroll within the panel space */}
                  <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {full12.map((m, i) => {
                      const isPeak  = i === peakIdx;
                      const barPct  = Math.round((m.revenue / maxRev) * 100);
                      const mrgPct  = m.revenue > 0 ? Math.round((m.margin / m.revenue) * 100) : null;
                      return (
                        <div key={m.key}
                          className={`grid grid-cols-[1.8rem_1fr_2.5rem] items-center gap-x-2 px-3 py-[5px] ${i < 11 ? "border-b border-[var(--line)]" : ""} ${isPeak ? "bg-[var(--accent)]/6" : ""}`}>
                          {/* Month */}
                          <span className={`text-[10px] font-bold ${isPeak ? "text-[var(--accent)]" : m.future ? "text-[var(--ink-muted)]/35" : "text-[var(--ink-muted)]"}`}>{m.label}</span>
                          {/* Revenue + bar + margin inline */}
                          <div className="flex min-w-0 flex-col gap-[2px]">
                            <div className="flex items-baseline gap-1.5">
                              <span className={`text-[11px] font-black tabular-nums leading-none ${isPeak ? "text-[var(--accent)]" : m.future ? "text-[var(--ink-muted)]/30" : "text-[var(--ink)]"}`}>
                                {m.revenue > 0 ? formatMoneyCompact(m.revenue, currency) : "—"}
                              </span>
                              {m.margin !== 0 && (
                                <span className={`text-[9.5px] tabular-nums leading-none ${m.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {formatMoneyCompact(m.margin, currency)}
                                </span>
                              )}
                            </div>
                            {/* Dual stacked bar: revenue (accent) + margin (emerald) overlay */}
                            <div className="relative h-[2.5px] overflow-hidden rounded-full bg-[var(--panel-strong)]">
                              <div className={`absolute inset-y-0 left-0 rounded-full ${isPeak ? "bg-[var(--accent)]" : "bg-[var(--accent)]/35"}`} style={{ width: `${barPct}%` }} />
                              {m.revenue > 0 && m.margin > 0 && (
                                <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/60" style={{ width: `${Math.round((m.margin / maxRev) * 100)}%` }} />
                              )}
                            </div>
                          </div>
                          {/* Margin % */}
                          <span className={`text-right text-[10px] font-semibold tabular-nums ${mrgPct === null ? "text-[var(--ink-muted)]/20" : mrgPct >= 0 ? "text-emerald-600" : "text-red-400"}`}>
                            {mrgPct !== null ? `${mrgPct}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

          </div>{/* end centre column */}

          {/* ── RIGHT COLUMN: Quick Actions + Sales Funnel + Inventory + Comms ── */}
          <div className="flex flex-col gap-3">

            {/* Quick Actions — 2×3 grid */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
              <p className="mb-2.5 text-sm font-semibold text-[var(--ink)]">Quick actions</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { href: "/jobs/new",                      label: "New Repair Job",   bg: "bg-sky-500/10",    color: "text-sky-600",    path: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" },
                  { href: "/documents/receipts",            label: "Record Payment",   bg: "bg-emerald-500/10",color: "text-emerald-600", path: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
                  { href: "/pos",                           label: "Product Sale",     bg: "bg-violet-500/10", color: "text-violet-600",  path: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18|M16 10a4 4 0 0 1-8 0" },
                  { href: "/finance/expenses",              label: "Add Expense",      bg: "bg-red-500/10",    color: "text-red-600",     path: "M12 19V5|M5 12l7-7 7 7" },
                  { href: "/inventory/purchase-orders/new", label: "Purchase Order",   bg: "bg-amber-500/10",  color: "text-amber-600",   path: "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14|M16.5 9.4 7.55 4.24|M3.29 7 12 12l8.71-5|M12 22V12" },
                  { href: "/intake",                        label: "New Intake",       bg: "bg-orange-500/10", color: "text-orange-600",  path: "M9 12h6|M9 16h4|M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6" },
                ] as const).map((action) => (
                  <Link key={action.href} href={action.href}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-2 transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${action.bg}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={action.color} aria-hidden="true">
                        {action.path.split("|").map((p, i) => <path key={i} d={p} />)}
                      </svg>
                    </span>
                    <p className="text-[12px] font-semibold leading-tight text-[var(--ink)]">{action.label}</p>
                  </Link>
                ))}
              </div>
            </section>

            {/* Sales Funnel — 2×2 compact */}
            {(() => {
              const ACTIVE = ["NEW","CONTACTED","QUALIFIED","PROPOSAL_SENT"] as const;
              const SMETA: Record<string, { label: string; dot: string; num: string; href: string }> = {
                NEW:           { label: "New",           dot: "bg-sky-500",    num: "text-sky-500",    href: "/sales/leads?status=NEW" },
                CONTACTED:     { label: "Contacted",     dot: "bg-violet-500", num: "text-violet-500", href: "/sales/leads?status=CONTACTED" },
                QUALIFIED:     { label: "Qualified",     dot: "bg-amber-500",  num: "text-amber-500",  href: "/sales/leads?status=QUALIFIED" },
                PROPOSAL_SENT: { label: "Proposal",      dot: "bg-orange-500", num: "text-orange-500", href: "/sales/leads?status=PROPOSAL_SENT" },
              };
              const maxC = Math.max(1, ...ACTIVE.map(s => leadCountMap.get(s) ?? 0));
              const pipelineVal = ACTIVE.reduce((sum, s) => {
                const row = (leadFunnel as Array<{ status: string; _sum?: { estimatedValue: number | null } }>).find(r => r.status === s);
                return sum + (row?._sum?.estimatedValue ?? 0);
              }, 0);
              const wonCount  = leadCountMap.get("WON")  ?? 0;
              const lostCount = leadCountMap.get("LOST") ?? 0;
              return (
                <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                    <p className="text-sm font-semibold text-[var(--ink)]">Sales funnel</p>
                    <Link href="/sales/leads" className="text-[12px] font-semibold text-[var(--accent)]">Leads →</Link>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)]">
                    {ACTIVE.map((s) => {
                      const count = leadCountMap.get(s) ?? 0;
                      const m = SMETA[s];
                      return (
                        <Link key={s} href={m.href} className="flex flex-col gap-1 px-3 py-2.5 transition hover:bg-[var(--panel-strong)]">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                            <p className="text-[11px] text-[var(--ink-muted)]">{m.label}</p>
                          </div>
                          <p className={`text-[20px] font-black leading-none tabular-nums ${count === 0 ? "text-[var(--ink-muted)]/25" : m.num}`}>{count}</p>
                          <div className="h-[2px] overflow-hidden rounded-full bg-[var(--panel-strong)]">
                            <div className={`h-full rounded-full ${m.dot} opacity-60`} style={{ width: `${Math.max(4, Math.round(count / maxC * 100))}%` }} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="flex items-center divide-x divide-[var(--line)] border-t border-[var(--line)]">
                    <Link href="/sales/leads?status=WON" className="flex flex-1 items-center justify-center gap-1.5 py-2 transition hover:bg-[var(--panel-strong)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <p className={`text-[12px] font-black ${wonCount > 0 ? "text-emerald-600" : "text-[var(--ink-muted)]"}`}>{wonCount}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">Won</p>
                    </Link>
                    <Link href="/sales/leads?status=LOST" className="flex flex-1 items-center justify-center gap-1.5 py-2 transition hover:bg-[var(--panel-strong)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      <p className={`text-[12px] font-black ${lostCount > 0 ? "text-red-500" : "text-[var(--ink-muted)]"}`}>{lostCount}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">Lost</p>
                    </Link>
                    {pipelineVal > 0 && (
                      <div className="flex flex-1 items-center justify-center gap-1 py-2">
                        <p className="text-[11px] text-[var(--ink-muted)]">Pipeline</p>
                        <p className="text-[12px] font-black text-[var(--accent)]">{formatMoneyCompact(pipelineVal, currency)}</p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* Inventory — full width, expanded */}
            <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[var(--ink)]">Inventory</p>
                <Link href="/inventory" className="text-[12px] font-semibold text-[var(--accent)]">View all →</Link>
              </div>
              {/* 3-stat summary row */}
              <div className="grid grid-cols-3 divide-x divide-[var(--line)] border-b border-[var(--line)]">
                {([
                  { label: "Tracked", value: lowStockParts.length, tone: "text-[var(--ink)]",   dot: "bg-sky-500",   href: "/inventory" },
                  { label: "Low",     value: lowStockItems.length, tone: lowStockItems.length > 0 ? "text-amber-500" : "text-[var(--ink-muted)]", dot: "bg-amber-500", href: "/inventory?filter=low" },
                  { label: "Out",     value: outOfStockCount,      tone: outOfStockCount > 0 ? "text-red-500" : "text-[var(--ink-muted)]",        dot: "bg-red-500",   href: "/inventory?filter=out" },
                ] as const).map((s) => (
                  <Link key={s.label} href={s.href} className="flex flex-col items-center gap-0.5 py-3 transition hover:bg-[var(--panel-strong)]">
                    <p className={`text-[22px] font-black tabular-nums leading-none ${s.tone}`}>{s.value}</p>
                    <div className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      <p className="text-[10px] text-[var(--ink-muted)]">{s.label}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Low-stock alert rows — up to 3 items, compact */}
              {lowStockItems.slice(0, 3).map((part) => {
                const isEmpty = part.qtyOnHand <= 0;
                const pct = part.reorderLevel > 0 ? Math.min(100, Math.round((part.qtyOnHand / part.reorderLevel) * 100)) : 0;
                return (
                  <Link key={part.id} href="/inventory"
                    className="flex items-center gap-2.5 border-t border-[var(--line)] px-4 py-2 transition hover:bg-[var(--panel-strong)]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isEmpty ? "bg-red-500" : "bg-amber-500"}`} />
                    <p className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink)]">{part.name}</p>
                    <div className="w-12 shrink-0">
                      <div className="h-[2px] overflow-hidden rounded-full bg-[var(--panel-strong)]">
                        <div className={`h-full rounded-full ${isEmpty ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                    <p className={`w-6 shrink-0 text-right text-[11px] font-bold tabular-nums ${isEmpty ? "text-red-500" : "text-amber-500"}`}>{part.qtyOnHand}</p>
                  </Link>
                );
              })}
              {lowStockItems.length > 3 && (
                <Link href="/inventory" className="block border-t border-[var(--line)] px-4 py-1.5 text-center text-[10px] font-semibold text-[var(--accent)] transition hover:bg-[var(--panel-strong)]">
                  +{lowStockItems.length - 3} more →
                </Link>
              )}
            </section>

            {/* Comms — trimmed, flex-1 to reach column bottom */}
            <section className="panel-shadow flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[var(--ink)]">Communications</p>
                <Link href="/settings/notifications/outbox" className="text-[12px] font-semibold text-[var(--accent)]">Outbox →</Link>
              </div>
              {/* Outbox health status */}
              <div className={`flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-2.5 ${failedOutboxCount > 0 ? "bg-rose-500/5" : "bg-emerald-500/5"}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${failedOutboxCount > 0 ? "bg-rose-500" : "bg-emerald-500"}`} />
                <p className={`flex-1 text-[12px] font-semibold ${failedOutboxCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {failedOutboxCount > 0 ? `${failedOutboxCount} message${failedOutboxCount > 1 ? "s" : ""} failed` : "Outbox healthy"}
                </p>
                {failedOutboxCount > 0 && (
                  <Link href="/settings/notifications/outbox" className="shrink-0 rounded-md bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold text-rose-600 transition hover:bg-rose-500/20">Fix</Link>
                )}
              </div>
              {/* Compact channel links */}
              <div className="divide-y divide-[var(--line)]">
                {([
                  { dot: "bg-emerald-500", label: "WhatsApp",  href: "/settings/notifications/whatsapp" },
                  { dot: "bg-sky-500",     label: "Outbox",    href: "/settings/notifications/outbox" },
                  { dot: "bg-violet-500",  label: "Templates", href: "/settings/notifications" },
                  { dot: "bg-amber-500",   label: "Policies",  href: "/settings/notifications" },
                ] as const).map((row) => (
                  <Link key={row.label} href={row.href} className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-[var(--panel-strong)]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.dot}`} />
                    <p className="flex-1 text-[12px] font-medium text-[var(--ink)]">{row.label}</p>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--ink-muted)]/30"><path d="m9 18 6-6-6-6"/></svg>
                  </Link>
                ))}
              </div>
              {intakePendingCount > 0 && (
                <Link href="/intake" className="flex items-center justify-between border-t border-[var(--line)] bg-orange-500/5 px-4 py-2 transition hover:bg-orange-500/10">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                    <p className="text-[11px] font-semibold text-orange-600">{intakePendingCount} awaiting intake</p>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400"><path d="m9 18 6-6-6-6"/></svg>
                </Link>
              )}
            </section>

          </div>{/* end right column */}

        </div>{/* end 3-col grid */}

        {/* ── Technician Leaderboard (full width — Recent Activity removed) ── */}
        <div>

          {/* Technician Leaderboard */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--ink)]">
                Technicians <span className="font-normal text-[var(--ink-muted)]">· {monthLabel(today.getFullYear(), today.getMonth() + 1)}</span>
              </p>
              <Link href="/technicians" className="text-[12px] font-semibold text-[var(--accent)]">Leaderboard →</Link>
            </div>
            {techLeaderboard.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No completed jobs this month.</p>
            ) : (
              <>
                {/* ── Mobile: compact card rows ── */}
                <div className="divide-y divide-[var(--line)] lg:hidden">
                  {techLeaderboard.map((tech, i) => {
                    const avgDays = tech.count > 0 ? (tech.totalDays / tech.count).toFixed(1) : null;
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    return (
                      <div key={tech.name} className="flex items-center gap-3 px-4 py-3">
                        {/* Avatar + rank */}
                        <div className="relative shrink-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[13px] font-black text-[var(--accent)]">
                            {tech.name.charAt(0).toUpperCase()}
                          </div>
                          {medal && (
                            <span className="absolute -right-1 -top-1 text-[12px] leading-none">{medal}</span>
                          )}
                          {!medal && (
                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--panel-strong)] text-[13px] font-bold text-[var(--ink-muted)]">
                              {i + 1}
                            </span>
                          )}
                        </div>
                        {/* Name + stats */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{tech.name}</p>
                          <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                            <span className="text-emerald-500 font-bold">{tech.count}</span> done
                            {tech.pending > 0 && <> · <span className="text-amber-500 font-bold">{tech.pending}</span> active</>}
                            {avgDays && <> · {avgDays}d avg</>}
                          </p>
                        </div>
                        {/* Revenue */}
                        <div className="shrink-0 text-right">
                          <p className="text-[12px] font-bold text-[var(--ink)]">{formatMoneyCompact(tech.revenue, currency)}</p>
                          {tech.payoutDue > 0 && (
                            <p className="text-[12px] font-semibold text-red-500">{formatMoneyCompact(tech.payoutDue, currency)} due</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop: full table ── */}
                <div className="hidden overflow-x-auto [scrollbar-width:thin] lg:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--line)]">
                        <th className="px-3 py-2 text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">#</th>
                        <th className="px-2 py-2 text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Technician</th>
                        <th className="px-2 py-2 text-center text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Done</th>
                        <th className="px-2 py-2 text-center text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Active</th>
                        <th className="px-2 py-2 text-center text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Avg TAT</th>
                        <th className="px-2 py-2 text-right text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Revenue</th>
                        <th className="px-3 py-2 text-right text-[13px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Payout Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {techLeaderboard.map((tech, i) => {
                        const avgDays = tech.count > 0 ? (tech.totalDays / tech.count).toFixed(1) : null;
                        return (
                          <tr key={tech.name} className="transition hover:bg-[var(--panel-strong)]">
                            <td className="px-3 py-3 text-[13px] font-bold text-[var(--ink-muted)]">
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[13px] font-bold text-[var(--accent)]">
                                  {tech.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold text-[var(--ink)]">{tech.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center text-sm font-bold text-emerald-600">{tech.count}</td>
                            <td className={`px-2 py-3 text-center text-sm font-bold ${tech.pending > 0 ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>{tech.pending}</td>
                            <td className="px-2 py-3 text-center text-xs text-[var(--ink-muted)]">{avgDays !== null ? `${avgDays}d` : "—"}</td>
                            <td className="px-2 py-3 text-right text-xs font-semibold text-[var(--ink)]">{formatMoneyCompact(tech.revenue, currency)}</td>
                            <td className={`px-3 py-3 text-right text-xs font-bold ${tech.payoutDue > 0 ? "text-red-500" : "text-[var(--ink-muted)]"}`}>
                              {formatMoneyCompact(tech.payoutDue, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

        </div>

      </div>
    );
  }

  if (user.role === "OPS") {
    const currency = getAppCurrency();
    const selectedMonth = parseMonth(filters.month);
    const selectedYear = Number(filters.year) || new Date().getFullYear();
    const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
    const selectedPeriodLabel = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
    const selectablePeriods = period === "year" ? yearOptions(6) : monthOptions(18);
    const reportHref =
      period === "year"
        ? `/reports?period=year&year=${selectedYear}`
        : `/reports?period=month&month=${selectedPeriodLabel}`;

    const trendMonths = trendMonthsForYear(selectedRange.start.getFullYear(), period === "year" ? 12 : selectedMonth.month);

    const [completedThisMonth, pendingBilling, externalCompleted] = await Promise.all([
      prisma.job.findMany({
        where: { status: "COMPLETED", completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        select: { id: true, jobNumber: true, completedAt: true, clientBill: true },
      }),
      prisma.job.count({
        where: {
          status: { in: ["IN_REPAIR", "READY_FOR_PICKUP", "AWAITING_APPROVAL"] },
        },
      }),
      prisma.job.findMany({
        where: {
          repairPath: "EXTERNAL",
          externalPaid: false,
          status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] },
        },
        select: { id: true, externalTechBill: true },
      }),
    ]);

    const monthRevenue = completedThisMonth.reduce((sum, job) => sum + (getClientBill(job) ?? 0), 0);

    const revenueTrend = await loadRepairRevenueTrend(trendMonths, user.orgId);

    const payoutMap = await getJobPayoutsByIds(externalCompleted.map((job) => job.id)).catch(() => new Map());
    // externalCompleted already pre-filtered to externalPaid=false in the DB query
    const payoutOutstanding = externalCompleted
      .reduce((sum, job) => sum + resolveTechCost(payoutMap.get(job.id)?.externalTechFee, job.externalTechBill), 0);

    return (
      <div className="space-y-4">
        <DashboardPeriodBar
          period={period}
          monthHref={`/dashboard?period=month&month=${monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}`}
          yearHref={`/dashboard?period=year&year=${new Date().getFullYear()}`}
          selectorName={period === "year" ? "year" : "month"}
          selectorValue={selectedPeriodLabel}
          selectorOptions={selectablePeriods}
        />

        <DashboardHero
          title="Operations Overview"
          summary={`${completedThisMonth.length} completed · ${pendingBilling} pending billing · revenue ${formatMoneyCompact(monthRevenue, currency)} · payouts ${formatMoneyCompact(payoutOutstanding, currency)}`}
          primaryHref="/jobs"
          primaryLabel="View Jobs"
          secondaryHref={reportHref}
          secondaryLabel="Reports"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Billing Queue</p>
            <div className="mt-3 space-y-2">
              <Link href="/jobs?status=IN_REPAIR,READY_FOR_PICKUP,AWAITING_APPROVAL" className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm hover:border-[var(--accent)]/30">
                <span>Pending billing jobs</span>
                <span className="font-semibold">{pendingBilling}</span>
              </Link>
              <Link href="/jobs?status=COMPLETED" className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm hover:border-[var(--accent)]/30">
                <span>Completed ({selectedPeriodLabel})</span>
                <span className="font-semibold">{completedThisMonth.length}</span>
              </Link>
            </div>
          </section>
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Cash Exposure</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span>Revenue ({selectedPeriodLabel})</span>
                <span className="font-semibold">{formatMoneyCompact(monthRevenue, currency)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span>External payouts due</span>
                <span className="font-semibold">{formatMoneyCompact(payoutOutstanding, currency)}</span>
              </div>
              <Link href={reportHref} className="mt-1 inline-flex text-xs font-semibold text-[var(--accent)] hover:underline">Open detailed finance reports →</Link>
            </div>
          </section>
        </div>

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={revenueTrend} currency={currency} label="Repair Revenue & Margin Trend" emptyMessage="No completed repair jobs yet for this period." />

      </div>
    );
  }

  if (user.role === "FRONT_DESK" || user.role === "INTAKE") {
    const selectedMonth = parseMonth(filters.month);
    const selectedYear = Number(filters.year) || new Date().getFullYear();
    const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
    const selectedPeriodLabel = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
    const selectablePeriods = period === "year" ? yearOptions(6) : monthOptions(18);

    const [capturedThisMonth, openFromIntake, awaitingApproval, readyForPickup] = await Promise.all([
      prisma.job.count({
        where: {
          createdById: session.user.id,
          receivedAt: { gte: selectedRange.start, lte: selectedRange.end },
        },
      }),
      prisma.job.count({
        where: {
          createdById: session.user.id,
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] },
        },
      }),
      prisma.job.count({ where: { status: "AWAITING_APPROVAL" } }),
      prisma.job.count({ where: { status: "READY_FOR_PICKUP" } }),
    ]);

    return (
      <div className="space-y-4">
        <DashboardPeriodBar
          period={period}
          monthHref={`/dashboard?period=month&month=${monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}`}
          yearHref={`/dashboard?period=year&year=${new Date().getFullYear()}`}
          selectorName={period === "year" ? "year" : "month"}
          selectorValue={selectedPeriodLabel}
          selectorOptions={selectablePeriods}
        />

        <DashboardHero
          title="Client Intake Console"
          summary="Capture requests quickly and move each intake through approval to handover."
          primaryHref="/jobs/new"
          primaryLabel="Capture New Job"
          secondaryHref="/jobs?status=AWAITING_APPROVAL"
          secondaryLabel="Open Approval Queue"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>}
        />

        <div className="hidden 2xl:block">
          <RepairStatusReference
            title="Intake to Delivery Flow"
            guidance="Keep this sequence in view when briefing clients so status updates are clear and consistent."
          />
        </div>

        {/* Compact inline KPI strip — replaces 2×2 mobile card grid */}
        <div className="panel-shadow grid grid-cols-4 divide-x divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:hidden">
          {[
            { label: "Captured",  value: capturedThisMonth, href: "/jobs/new",                                                                          color: "text-[var(--ink)]" },
            { label: "Open",      value: openFromIntake,    href: "/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP",       color: "text-[var(--accent)]" },
            { label: "Approval",  value: awaitingApproval,  href: "/jobs?status=AWAITING_APPROVAL",                                                      color: awaitingApproval > 0 ? "text-amber-500" : "text-[var(--ink-muted)]" },
            { label: "Ready",     value: readyForPickup,    href: "/jobs?status=READY_FOR_PICKUP",                                                       color: readyForPickup > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="flex flex-col items-center justify-center gap-0.5 py-3 transition hover:bg-[var(--panel-strong)]">
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[13px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{item.label}</p>
            </Link>
          ))}
        </div>

        {/* Compact 4-stat strip for desktop */}
        <div className="panel-shadow hidden grid-cols-4 divide-x divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:grid">
          {[
            { label: `Captured (${selectedPeriodLabel})`, value: capturedThisMonth, href: "/jobs/new",                                                                          color: "text-[var(--ink)]" },
            { label: "Open queue",                        value: openFromIntake,    href: "/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP",       color: "text-[var(--accent)]" },
            { label: "Awaiting approval",                 value: awaitingApproval,  href: "/jobs?status=AWAITING_APPROVAL",                                                      color: awaitingApproval > 0 ? "text-amber-500" : "text-[var(--ink-muted)]" },
            { label: "Ready for pickup",                  value: readyForPickup,    href: "/jobs?status=READY_FOR_PICKUP",                                                       color: readyForPickup > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="flex flex-col items-center justify-center gap-0.5 py-3 transition hover:bg-[var(--panel-strong)]">
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[13px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── MANAGER dashboard ─────────────────────────────────────────────────────
  if (user.role === "MANAGER") {
    const currency = getAppCurrency();
    const today = new Date();
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const mtdLabel = monthLabel(today.getFullYear(), today.getMonth() + 1);

    const [statusGroup, completedMtd, overdueJobs, techWorkloadJobs, unassignedCount, receivedToday, completedToday, awaitingApprovalCount] = await Promise.all([
      prisma.job.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.job.findMany({
        where: { status: "COMPLETED", completedAt: { gte: mtdStart } },
        select: { clientBill: true },
      }),
      prisma.job.findMany({
        where: {
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR"]) as JobStatus[] },
          receivedAt: { lt: threeDaysAgo },
        },
        select: { id: true, jobNumber: true, status: true, receivedAt: true, device: { select: { brand: true, model: true } } },
        orderBy: { receivedAt: "asc" },
        take: 8,
      }).catch(async () => {
        const fb = await prisma.job.findMany({
          where: { status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR"]) as JobStatus[] }, receivedAt: { lt: threeDaysAgo } },
          select: { id: true, jobNumber: true, status: true, receivedAt: true },
          orderBy: { receivedAt: "asc" }, take: 8,
        });
        return fb.map(j => ({ ...j, device: null }));
      }),
      prisma.job.findMany({
        where: {
          status: { in: filterSupportedJobStatuses(["DIAGNOSING", "IN_REPAIR", "REFERRED", "AWAITING_APPROVAL", "READY_FOR_PICKUP"]) as JobStatus[] },
          assignedToId: { not: null },
        },
        select: { assignedTo: { select: { id: true, name: true, role: true } } },
      }),
      prisma.job.count({
        where: {
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_REPAIR"]) as JobStatus[] },
          assignedToId: null,
        },
      }),
      prisma.job.count({ where: { receivedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { completedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { status: "AWAITING_APPROVAL" } }),
    ]);

    const revenueMtd = completedMtd.reduce((sum, j) => sum + (getClientBill(j) ?? 0), 0);
    const statusCount = new Map<string, number>();
    for (const item of statusGroup) {
      const key = normalizeJobStatus(item.status as JobStatus);
      statusCount.set(key, (statusCount.get(key) ?? 0) + item._count.status);
    }
    const overdueWithDays = overdueJobs.map(j => ({ ...j, ageDays: Math.floor((today.getTime() - j.receivedAt.getTime()) / 86400000) }));
    const techMap = new Map<string, { id: string; name: string; role: string; count: number }>();
    for (const j of techWorkloadJobs) {
      if (!j.assignedTo) continue;
      const e = techMap.get(j.assignedTo.id) ?? { ...j.assignedTo, count: 0 };
      e.count += 1;
      techMap.set(j.assignedTo.id, e);
    }
    const techRows = [...techMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);
    const trendMonths = trendMonthsSinceStartOfYear(today);
    const revenueTrend = await loadTotalRevenueTrend(trendMonths, user.orgId, currency);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Manager Overview"
          summary={`${receivedToday} in · ${completedToday} out today · ${overdueWithDays.length} overdue · revenue ${formatMoneyCompact(revenueMtd, currency)} MTD`}
          primaryHref="/reports"
          primaryLabel="Full Reports"
          secondaryHref="/jobs"
          secondaryLabel="All Jobs"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        />

        {(overdueWithDays.length > 0 || awaitingApprovalCount > 0 || unassignedCount > 0) && (
          <section className="panel-shadow rounded-xl border border-[var(--accent)]/25 bg-[var(--panel)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Attention Required</span>
              {awaitingApprovalCount > 0 && <Link href="/jobs?status=AWAITING_APPROVAL" className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[13px] font-medium text-[var(--accent)]">{awaitingApprovalCount} awaiting approval</Link>}
              {overdueWithDays.length > 0 && <span className="rounded-full border border-white/10 bg-[#0b0b0b] px-2.5 py-1 text-[13px] font-medium text-white/90">{overdueWithDays.length} overdue 3+ days</span>}
              {unassignedCount > 0 && <Link href="/jobs?assignedToId=unassigned" className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink)]">{unassignedCount} unassigned</Link>}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Revenue MTD", val: formatMoneyCompact(revenueMtd, currency), href: `/reports?period=month&month=${mtdLabel}`, color: "text-[var(--accent)]" },
            { label: "Completed MTD", val: String(completedMtd.length), href: "/jobs?status=COMPLETED", color: "text-emerald-600" },
            { label: "In Pipeline", val: String((statusCount.get("DIAGNOSING") ?? 0) + (statusCount.get("IN_REPAIR") ?? 0) + (statusCount.get("AWAITING_APPROVAL") ?? 0)), href: "/jobs?status=DIAGNOSING,IN_REPAIR,AWAITING_APPROVAL", color: "text-[var(--ink)]" },
            { label: "Ready Pickup", val: String(statusCount.get("READY_FOR_PICKUP") ?? 0), href: "/jobs?status=READY_FOR_PICKUP", color: "text-[var(--accent)]" },
          ].map(t => (
            <Link key={t.label} href={t.href} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px]">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">{t.label}</p>
              <p className={`mt-1 text-[15px] font-black leading-tight ${t.color}`}>{t.val}</p>
            </Link>
          ))}
        </div>

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={revenueTrend} currency={currency} label="Total Revenue & Margin (Repairs + Sales)" emptyMessage="No revenue recorded yet for this period." />

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Live Pipeline</p>
            <div className="space-y-1.5">
              {UI_JOB_STATUSES.filter(s => s !== "CLOSED" && s !== "COMPLETED").map(s => {
                const count = statusCount.get(s) ?? 0;
                return (
                  <Link key={s} href={`/jobs?status=${s}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/35">
                    <p className="text-xs font-medium text-[var(--ink)]">{statusLabel[s]}</p>
                    <span className={`text-sm font-bold ${count > 0 ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}>{count}</span>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Staff Workload</p>
              {unassignedCount > 0 && <Link href="/jobs?assignedToId=unassigned" className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[12px] font-bold text-amber-600">{unassignedCount} unassigned</Link>}
            </div>
            {techRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No active assignments.</p>
            ) : (
              <div className="space-y-1.5">
                {techRows.map(t => (
                  <Link key={t.id} href={`/jobs?assignedToId=${t.id}`} className="group flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/35">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold group-hover:text-[var(--accent)] transition-colors">{t.name}</p>
                      <p className="text-[12px] text-[var(--ink-muted)]">{t.role === "TECHNICIAN_EXTERNAL" ? "External" : t.role === "TECHNICIAN_INTERNAL" ? "Internal" : t.role}</p>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${t.role === "TECHNICIAN_EXTERNAL" ? "bg-violet-500/15 text-violet-400" : "bg-sky-500/15 text-sky-500"}`}>{t.count} active</span>
                  </Link>
                ))}
                {overdueWithDays.length > 0 && (
                  <div className="mt-2 border-t border-[var(--line)] pt-2">
                    <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Overdue Jobs</p>
                    {overdueWithDays.slice(0, 4).map(j => (
                      <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-amber-500/30 mb-1">
                        <div className="min-w-0">
                          <p className="mono truncate text-xs font-bold text-[var(--accent)]">{j.jobNumber}</p>
                          <p className="truncate text-[12px] text-[var(--ink-muted)]">{statusLabel[j.status as keyof typeof statusLabel] ?? j.status}</p>
                        </div>
                        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${j.ageDays >= 8 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-600"}`}>{j.ageDays}d</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── FINANCE dashboard ──────────────────────────────────────────────────────
  if (user.role === "FINANCE") {
    const currency = getAppCurrency();
    const today = new Date();
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const mtdLabel = monthLabel(today.getFullYear(), today.getMonth() + 1);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const sixtyDaysAgo  = new Date(today.getTime() - 60 * 86400000);

    const [invoices, recentPayments, salesRevenue] = await Promise.all([
      prisma.invoice.findMany({
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true, issuedAt: true, job: { select: { jobNumber: true, client: { select: { fullName: true } } } } },
        orderBy: { issuedAt: "desc" },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: mtdStart } },
        select: { amount: true, method: true, receivedAt: true, currency: true },
        orderBy: { receivedAt: "desc" },
        take: 20,
      }),
      prisma.sale.findMany({
        where: { status: "PAID", paidAt: { gte: mtdStart } },
        select: { totalAmount: true },
      }),
    ]);

    const totalInvoiced = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalCollected = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalOutstanding = totalInvoiced - totalCollected;
    const overdueCount = invoices.filter(i => i.status !== "PAID" && i.issuedAt < thirtyDaysAgo).length;
    const ageingCurrent  = invoices.filter(i => i.status !== "PAID" && i.issuedAt >= thirtyDaysAgo).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    const ageing30to60   = invoices.filter(i => i.status !== "PAID" && i.issuedAt >= sixtyDaysAgo && i.issuedAt < thirtyDaysAgo).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    const ageing60plus   = invoices.filter(i => i.status !== "PAID" && i.issuedAt < sixtyDaysAgo).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    const posRevenueMtd  = salesRevenue.reduce((s, r) => s + r.totalAmount, 0);
    const invoiceRevenueMtd = invoices.filter(i => i.status === "PAID" && i.issuedAt >= mtdStart).reduce((s, i) => s + i.totalAmount, 0);
    const mtdPayments = recentPayments.reduce((s, p) => s + p.amount, 0);
    const methodTotals = recentPayments.reduce((acc, p) => { acc[p.method] = (acc[p.method] ?? 0) + p.amount; return acc; }, {} as Record<string, number>);
    const unpaidInvoices = invoices.filter(i => i.status !== "PAID" && i.status !== "VOID");

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Finance & Accounts"
          summary={`${formatMoneyCompact(totalOutstanding, currency)} outstanding · ${overdueCount} overdue invoices · ${formatMoneyCompact(mtdPayments, currency)} collected MTD`}
          primaryHref="/documents/invoices"
          primaryLabel="Invoices"
          secondaryHref="/reports"
          secondaryLabel="Reports"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total Invoiced", val: formatMoneyCompact(totalInvoiced, currency), href: "/documents/invoices", color: "text-[var(--ink)]" },
            { label: "Collected",      val: formatMoneyCompact(totalCollected, currency), href: "/documents/invoices?status=PAID", color: "text-emerald-600" },
            { label: "Outstanding",    val: formatMoneyCompact(totalOutstanding, currency), href: "/documents/invoices?status=ISSUED", color: totalOutstanding > 0 ? "text-[var(--accent)]" : "text-emerald-600" },
            { label: "Overdue (30d+)", val: String(overdueCount), href: "/documents/invoices", color: overdueCount > 0 ? "text-red-400" : "text-[var(--ink-muted)]" },
          ].map(t => (
            <Link key={t.label} href={t.href} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px]">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">{t.label}</p>
              <p className={`mt-1 text-[15px] font-black leading-tight ${t.color}`}>{t.val}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Invoice Ageing</p>
            <div className="space-y-2">
              {[
                { label: "Current (0–30 days)", amount: ageingCurrent, color: "bg-[var(--accent)]/10 border-[var(--accent)]/20 text-[var(--accent)]" },
                { label: "30–60 days",          amount: ageing30to60, color: "bg-amber-500/10 border-amber-500/25 text-amber-600" },
                { label: "60+ days (overdue)",  amount: ageing60plus, color: "bg-red-500/10 border-red-500/20 text-red-400" },
              ].map(row => (
                <div key={row.label} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${row.color}`}>
                  <p className="text-xs font-medium">{row.label}</p>
                  <p className="text-sm font-bold">{formatMoneyCompact(row.amount, currency)}</p>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5">
                <p className="text-xs font-semibold text-[var(--ink)]">Total Outstanding</p>
                <p className="text-sm font-black text-[var(--ink)]">{formatMoneyCompact(totalOutstanding, currency)}</p>
              </div>
            </div>
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">MTD Cash In — {mtdLabel}</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5">
                <p className="text-xs text-[var(--ink-muted)]">Invoice payments</p>
                <p className="text-sm font-bold text-emerald-600">{formatMoneyCompact(invoiceRevenueMtd, currency)}</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5">
                <p className="text-xs text-[var(--ink-muted)]">POS / cash sales</p>
                <p className="text-sm font-bold text-emerald-600">{formatMoneyCompact(posRevenueMtd, currency)}</p>
              </div>
              {Object.entries(methodTotals).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                  <p className="text-xs text-[var(--ink-muted)]">{method.replace(/_/g, " ")}</p>
                  <p className="text-sm font-semibold text-[var(--ink)]">{formatMoneyCompact(amount, currency)}</p>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                <p className="text-xs font-bold text-emerald-600">Total in MTD</p>
                <p className="text-sm font-black text-emerald-600">{formatMoneyCompact(mtdPayments + posRevenueMtd, currency)}</p>
              </div>
            </div>
          </section>
        </div>

        <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Unpaid Invoices</p>
            <Link href="/documents/invoices" className="text-[13px] font-semibold text-[var(--accent)] hover:underline">View all →</Link>
          </div>
          {unpaidInvoices.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[13px] font-medium text-emerald-600">All invoices paid — nothing outstanding.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {unpaidInvoices.slice(0, 8).map(inv => {
                const balance = inv.totalAmount - inv.paidAmount;
                const ageDays = Math.floor((today.getTime() - inv.issuedAt.getTime()) / 86400000);
                return (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="mono truncate text-xs font-bold text-[var(--ink)]">{inv.invoiceNumber}</p>
                      <p className="truncate text-[12px] text-[var(--ink-muted)]">{inv.job?.client?.fullName ?? "—"} · {inv.job?.jobNumber ?? "—"}</p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="text-xs font-semibold text-[var(--accent)]">{formatMoneyCompact(balance, currency)}</p>
                      <span className={`text-[12px] font-medium ${ageDays > 60 ? "text-red-400" : ageDays > 30 ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>{ageDays}d</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── SALES dashboard ────────────────────────────────────────────────────────
  if (user.role === "SALES") {
    const currency = getAppCurrency();
    const today    = new Date();
    const period   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1, 0, 0, 0, 0);
    const prevMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    const orgFilter = user.orgId ? { orgId: user.orgId } : {};

    const [
      completedJobsMtd,
      allJobsMtd,
      prevMonthJobCount,
      paidSalesMtd,
      paidInvoicesMtd,
      awaitingApproval,
      readyPickup,
      quotedJobs,
      salesMtdByStaff,
      jobsMtdByStaff,
      teamTarget,
      myTarget,
    ] = await Promise.all([
      // Completed jobs MTD for repair revenue
      prisma.job.findMany({
        where: { ...orgFilter, status: "COMPLETED", completedAt: { gte: mtdStart } },
        select: { id: true, clientBill: true, externalTechBill: true, createdById: true, createdBy: { select: { id: true, name: true } } },
      }),
      // All jobs received MTD for funnel stats
      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: mtdStart } } }),
      prisma.job.count({ where: { ...orgFilter, receivedAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
      // POS sales paid MTD
      prisma.sale.findMany({
        where: { ...orgFilter, status: "PAID", paidAt: { gte: mtdStart } },
        select: { totalAmount: true, createdById: true, createdBy: { select: { id: true, name: true } } },
      }),
      // Invoice payments MTD
      prisma.invoice.findMany({
        where: { ...orgFilter, status: "PAID", paidAt: { gte: mtdStart } },
        select: { totalAmount: true, job: { select: { createdById: true, createdBy: { select: { id: true, name: true } } } } },
      }),
      prisma.job.count({ where: { ...orgFilter, status: "AWAITING_APPROVAL" } }),
      prisma.job.count({ where: { ...orgFilter, status: "READY_FOR_PICKUP" } }),
      prisma.job.findMany({
        where: { ...orgFilter, status: "AWAITING_APPROVAL" },
        select: { id: true, jobNumber: true, clientBill: true, client: { select: { fullName: true } }, receivedAt: true },
        orderBy: { receivedAt: "asc" },
        take: 8,
      }),
      // POS sales per staff this month
      prisma.sale.groupBy({
        by: ["createdById"],
        where: { ...orgFilter, status: "PAID", paidAt: { gte: mtdStart }, createdById: { not: null } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // Jobs created per staff this month (for repair revenue attribution)
      prisma.job.findMany({
        where: { ...orgFilter, status: "COMPLETED", completedAt: { gte: mtdStart }, createdById: { not: undefined } },
        select: { createdById: true, createdBy: { select: { name: true } }, clientBill: true },
      }),
      // Team target for current month
      prisma.salesTarget.findFirst({ where: { ...orgFilter, userId: null, period } }).catch(() => null),
      // My own target
      user.id ? prisma.salesTarget.findFirst({ where: { ...orgFilter, userId: user.id, period } }).catch(() => null) : Promise.resolve(null),
    ]);

    // ── Revenue aggregation ─────────────────────────────────────────────────
    const repairRevenueMtd = completedJobsMtd.reduce((s, j) => s + (getClientBill(j) ?? 0), 0);
    const posRevenueMtd    = paidSalesMtd.reduce((s, r) => s + r.totalAmount, 0);
    const invoiceRevenueMtd = paidInvoicesMtd.reduce((s, i) => s + i.totalAmount, 0);
    const totalRevenueMtd  = repairRevenueMtd + posRevenueMtd + invoiceRevenueMtd;
    const teamTargetRevenue = teamTarget?.targetRevenue ?? 0;
    const targetPct = teamTargetRevenue > 0 ? Math.round((totalRevenueMtd / teamTargetRevenue) * 100) : null;
    const myTargetRevenue = myTarget?.targetRevenue ?? 0;

    // ── Per-staff performance ────────────────────────────────────────────────
    // Build a map: staffId → { name, repairRev, posRev, totalRev, jobCount, saleCount }
    const staffMap = new Map<string, { name: string; repairRev: number; posRev: number; totalRev: number; jobCount: number; saleCount: number; target: number }>();

    for (const j of jobsMtdByStaff) {
      if (!j.createdById || !j.createdBy) continue;
      const e = staffMap.get(j.createdById) ?? { name: j.createdBy.name, repairRev: 0, posRev: 0, totalRev: 0, jobCount: 0, saleCount: 0, target: 0 };
      e.repairRev += getClientBill(j) ?? 0;
      e.jobCount  += 1;
      e.totalRev   = e.repairRev + e.posRev;
      staffMap.set(j.createdById, e);
    }
    for (const s of salesMtdByStaff) {
      if (!s.createdById) continue;
      // Need name — find from paidSalesMtd
      const saleRecord = paidSalesMtd.find(r => r.createdById === s.createdById);
      const name = saleRecord?.createdBy?.name ?? s.createdById;
      const e = staffMap.get(s.createdById) ?? { name, repairRev: 0, posRev: 0, totalRev: 0, jobCount: 0, saleCount: 0, target: 0 };
      e.posRev   += s._sum.totalAmount ?? 0;
      e.saleCount += s._count.id;
      e.totalRev  = e.repairRev + e.posRev;
      staffMap.set(s.createdById, e);
    }
    // Fetch individual targets for all staff in map
    const staffIds = [...staffMap.keys()];
    if (staffIds.length > 0) {
      const indivTargets = await prisma.salesTarget.findMany({
        where: { ...orgFilter, userId: { in: staffIds }, period },
        select: { userId: true, targetRevenue: true },
      }).catch(() => [] as { userId: string | null; targetRevenue: number }[]);
      for (const t of indivTargets) {
        if (!t.userId) continue;
        const e = staffMap.get(t.userId);
        if (e) { e.target = t.targetRevenue; staffMap.set(t.userId, e); }
      }
    }

    const staffRows = [...staffMap.values()].sort((a, b) => b.totalRev - a.totalRev);
    const wonMtd = completedJobsMtd.length;
    const conversionRate = allJobsMtd > 0 ? Math.round((wonMtd / allJobsMtd) * 100) : 0;

    const trendMonths  = trendMonthsSinceStartOfYear(today);
    const revenueTrend = await loadTotalRevenueTrend(trendMonths, user.orgId, currency);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Sales Performance"
          summary={`${formatMoneyCompact(totalRevenueMtd, currency)} total revenue MTD${teamTargetRevenue > 0 ? ` · ${targetPct}% of target` : ""} · ${awaitingApproval} awaiting approval`}
          primaryHref="/jobs/new"
          primaryLabel="New Job"
          secondaryHref="/jobs?status=AWAITING_APPROVAL"
          secondaryLabel="Approval Queue"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />

        {/* ── Team target progress bar ── */}
        {teamTargetRevenue > 0 && (
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Team Target — {period}</p>
              <span className={`text-sm font-black ${(targetPct ?? 0) >= 100 ? "text-emerald-600" : (targetPct ?? 0) >= 60 ? "text-[var(--accent)]" : "text-amber-600"}`}>
                {targetPct ?? 0}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--panel-strong)]">
              <div
                className={`h-full rounded-full transition-all ${(targetPct ?? 0) >= 100 ? "bg-emerald-500" : "bg-[var(--accent)]"}`}
                style={{ width: `${Math.min(100, targetPct ?? 0)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-[var(--ink-muted)]">
              <span>{formatMoneyCompact(totalRevenueMtd, currency)} achieved</span>
              <span>target {formatMoneyCompact(teamTargetRevenue, currency)}</span>
            </div>
          </section>
        )}

        {/* ── 4 KPI tiles ── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total Revenue MTD",  val: formatMoneyCompact(totalRevenueMtd, currency),   sub: teamTargetRevenue > 0 ? `${targetPct}% of ${formatMoneyCompact(teamTargetRevenue, currency)} target` : "all channels",      href: "/reports",                                      color: "text-[var(--accent)]" },
            { label: "Repair Revenue",     val: formatMoneyCompact(repairRevenueMtd, currency),  sub: `${wonMtd} completed jobs`,                                                                                                    href: "/jobs?status=COMPLETED",                        color: "text-sky-600" },
            { label: "POS + Invoices",     val: formatMoneyCompact(posRevenueMtd + invoiceRevenueMtd, currency), sub: `${paidSalesMtd.length} sales · ${paidInvoicesMtd.length} invoices`,                                          href: "/documents/invoices",                           color: "text-violet-600" },
            { label: "Conversion Rate",    val: `${conversionRate}%`,                            sub: `${wonMtd} won vs ${prevMonthJobCount} last month`,                                                                             href: "/jobs?status=COMPLETED,READY_FOR_PICKUP",       color: conversionRate >= 50 ? "text-emerald-600" : "text-amber-600" },
          ].map(t => (
            <Link key={t.label} href={t.href} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px]">
              <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">{t.label}</p>
              <p className={`mt-1 text-[15px] font-black leading-tight ${t.color}`}>{t.val}</p>
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{t.sub}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* ── Individual staff performance ── */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Staff Performance — {period}</p>
              <Link href="/reports" className="text-[13px] font-semibold text-[var(--accent)] hover:underline">Full report →</Link>
            </div>
            {staffRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No sales activity this month yet.</p>
            ) : (
              <div className="space-y-2">
                {staffRows.map((s, i) => {
                  const pct = s.target > 0 ? Math.min(100, Math.round((s.totalRev / s.target) * 100)) : null;
                  return (
                    <div key={s.name} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 text-[12px] font-bold text-[var(--ink-muted)] w-4">{i + 1}</span>
                          <p className="truncate text-xs font-semibold text-[var(--ink)]">{s.name}</p>
                        </div>
                        <div className="ml-3 shrink-0 flex items-center gap-2">
                          {pct !== null && (
                            <span className={`text-[12px] font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 60 ? "text-[var(--accent)]" : "text-amber-600"}`}>{pct}%</span>
                          )}
                          <span className="text-xs font-bold text-[var(--ink)]">{formatMoneyCompact(s.totalRev, currency)}</span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 text-[12px] text-[var(--ink-muted)]">
                        <span className="text-sky-600">{formatMoneyCompact(s.repairRev, currency)} repair</span>
                        <span className="text-violet-600">{formatMoneyCompact(s.posRev, currency)} POS</span>
                        {s.target > 0 && (
                          <>
                            <span>·</span>
                            <span>target {formatMoneyCompact(s.target, currency)}</span>
                          </>
                        )}
                      </div>
                      {pct !== null && (
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--line)]">
                          <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-[var(--accent)]"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* My own target summary if viewer has a personal target */}
            {myTargetRevenue > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">My Target</p>
                <p className="mt-0.5 text-xs text-[var(--ink)]">{formatMoneyCompact(myTargetRevenue, currency)} this month</p>
              </div>
            )}
          </section>

          {/* ── Pending approvals + channel breakdown ── */}
          <div className="space-y-3">
            {/* Revenue by channel */}
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Revenue by Channel MTD</p>
              {[
                { label: "Repair Jobs",       amount: repairRevenueMtd,                    color: "bg-sky-500",    textColor: "text-sky-600",    count: `${wonMtd} completed` },
                { label: "POS Sales",         amount: posRevenueMtd,                       color: "bg-violet-500", textColor: "text-violet-600", count: `${paidSalesMtd.length} sales` },
                { label: "Invoice Payments",  amount: invoiceRevenueMtd,                   color: "bg-emerald-500",textColor: "text-emerald-600",count: `${paidInvoicesMtd.length} invoices` },
              ].map(ch => {
                const pct = totalRevenueMtd > 0 ? Math.round((ch.amount / totalRevenueMtd) * 100) : 0;
                return (
                  <div key={ch.label} className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-[var(--ink)]">{ch.label}</span>
                      <span className={`font-bold ${ch.textColor}`}>{formatMoneyCompact(ch.amount, currency)} <span className="font-normal text-[var(--ink-muted)]">({pct}%)</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                        <div className={`h-full rounded-full ${ch.color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-[12px] text-[var(--ink-muted)]">{ch.count}</span>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Pending approvals */}
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Pending Approvals</p>
                <Link href="/jobs?status=AWAITING_APPROVAL" className="text-[13px] font-semibold text-[var(--accent)] hover:underline">All →</Link>
              </div>
              {quotedJobs.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">No quotes pending.</p>
              ) : (
                <div className="space-y-1.5">
                  {quotedJobs.slice(0, 5).map(j => {
                    const waitDays = Math.floor((today.getTime() - j.receivedAt.getTime()) / 86400000);
                    return (
                      <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/35">
                        <div className="min-w-0">
                          <p className="mono truncate text-xs font-bold text-[var(--accent)]">{j.jobNumber}</p>
                          <p className="truncate text-[12px] text-[var(--ink-muted)]">{j.client?.fullName ?? "—"}</p>
                        </div>
                        <div className="ml-3 shrink-0 text-right">
                          {j.clientBill && <p className="text-xs font-semibold text-[var(--ink)]">{formatMoneyCompact(j.clientBill, currency)}</p>}
                          <span className={`text-[12px] font-medium ${waitDays > 3 ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>{waitDays}d wait</span>
                        </div>
                      </Link>
                    );
                  })}
                  {readyPickup > 0 && (
                    <Link href="/jobs?status=READY_FOR_PICKUP" className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 transition hover:border-emerald-500/50">
                      <p className="text-xs font-semibold text-emerald-600">{readyPickup} jobs ready for pickup</p>
                      <span className="text-[13px] font-bold text-emerald-600">→</span>
                    </Link>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={revenueTrend} currency={currency} label="Total Revenue Trend (All Channels)" emptyMessage="No revenue recorded yet for this period." />
      </div>
    );
  }

  if (user.role === "SALES_MANAGER") {
    const currency = getAppCurrency();
    const now = new Date();
    const { start: monthStart, end: monthEnd } = monthRange(now.getFullYear(), now.getMonth() + 1);
    const orgFilter = user.orgId ? { orgId: user.orgId } : {};

    const [leadsOpen, leadsWon, quotationsPending, salesThisMonthAgg] = await Promise.all([
      prisma.lead.count({
        where: { ...orgFilter, status: { in: ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT"] } },
      }).catch(() => 0),
      prisma.lead.count({ where: { ...orgFilter, status: "WON" } }).catch(() => 0),
      prisma.quotation.count({
        where: { ...orgFilter, status: { in: ["DRAFT", "SENT"] } },
      }).catch(() => 0),
      prisma.sale.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...orgFilter,
          status: "PAID",
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }).catch(() => ({ _sum: { totalAmount: null } })),
    ]);

    const salesThisMonth = salesThisMonthAgg._sum.totalAmount ?? 0;

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Sales Command Centre"
          summary="Monitor leads pipeline, track quotations, and review revenue against targets."
          primaryHref="/sales"
          primaryLabel="Open CRM"
          secondaryHref="/targets"
          secondaryLabel="View Targets"
        />

        <StickyKpiRow
          items={[
            { label: "Open Leads", value: String(leadsOpen), href: "/sales", tone: "brand" },
            { label: "Won", value: String(leadsWon), href: "/sales?tab=leads&status=WON", tone: "success" },
            { label: "Quotes Pending", value: String(quotationsPending), href: "/sales?tab=quotations", tone: "warning" },
            { label: "Revenue", value: formatMoney(salesThisMonth, currency), href: "/reports" },
          ]}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <Link href="/sales" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open Leads</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{leadsOpen}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View pipeline →</p>
          </Link>
          <Link href="/sales?tab=leads&status=WON" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Won Leads</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{leadsWon}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View won leads →</p>
          </Link>
          <Link href="/sales?tab=quotations" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Quotations Pending</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{quotationsPending}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Review quotations →</p>
          </Link>
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Revenue This Month</p>
            <p className="mt-1 text-xl font-semibold text-[var(--ink)]">{formatMoney(salesThisMonth, currency)}</p>
            <p className="mt-2 text-xs text-[var(--ink-muted)]">Paid sales</p>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === "SALES_CORPORATE") {
    const orgFilter = user.orgId ? { orgId: user.orgId } : {};
    const myLeadAccess = { OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] };
    const [myQuotationsDraft, myQuotationsSent, myLeads, openInvoices] = await Promise.all([
      prisma.quotation.count({
        where: { ...orgFilter, createdById: session.user.id, status: "DRAFT" },
      }).catch(() => 0),
      prisma.quotation.count({
        where: { ...orgFilter, createdById: session.user.id, status: "SENT" },
      }).catch(() => 0),
      prisma.lead.count({
        where: {
          ...orgFilter,
          ...myLeadAccess,
          status: { in: ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT"] },
        },
      }).catch(() => 0),
      prisma.invoice.count({
        where: { ...orgFilter, status: { in: ["DRAFT", "ISSUED"] } },
      }).catch(() => 0),
    ]);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Corporate Sales"
          summary="Manage your corporate accounts, track quotation approvals, and keep leads progressing."
          primaryHref="/sales"
          primaryLabel="Open Pipeline"
          secondaryHref="/sales/quotations/new"
          secondaryLabel="New Quotation"
        />

        <StickyKpiRow
          items={[
            { label: "Draft Quotes", value: String(myQuotationsDraft), href: "/sales?tab=quotations", tone: "warning" },
            { label: "Sent Quotes", value: String(myQuotationsSent), href: "/sales?tab=quotations", tone: "brand" },
            { label: "My Leads", value: String(myLeads), href: "/sales", tone: "success" },
            { label: "Open Invoices", value: String(openInvoices), href: "/documents/invoices", tone: "warning" },
          ]}
        />

        <div className="grid gap-3 lg:grid-cols-4">
          <Link href="/sales?tab=quotations" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Draft Quotations</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{myQuotationsDraft}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open drafts →</p>
          </Link>
          <Link href="/sales?tab=quotations" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Sent Quotations</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{myQuotationsSent}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Track sent →</p>
          </Link>
          <Link href="/sales" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Active Leads</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{myLeads}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View my leads →</p>
          </Link>
          <Link href="/documents/invoices" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open Invoices</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{openInvoices}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open invoices →</p>
          </Link>
        </div>
      </div>
    );
  }

  if (user.role === "SALES_RETAIL") {
    const orgFilter = user.orgId ? { orgId: user.orgId } : {};
    const myLeadAccess = { OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] };
    const [myLeads, myQuotations, posOpen] = await Promise.all([
      prisma.lead.count({
        where: {
          ...orgFilter,
          ...myLeadAccess,
          status: { notIn: ["WON", "LOST", "STALE"] },
        },
      }).catch(() => 0),
      prisma.quotation.count({
        where: {
          ...orgFilter,
          createdById: session.user.id,
          status: { in: ["DRAFT", "SENT"] },
        },
      }).catch(() => 0),
      prisma.posSession.count({
        where: { ...orgFilter, operatorId: session.user.id, status: "OPEN" },
      }).catch(() => 0),
    ]);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Retail Sales Desk"
          summary="Manage your active leads, open quotations, and daily POS sessions."
          primaryHref="/sales"
          primaryLabel="My Leads"
          secondaryHref="/pos"
          secondaryLabel="POS"
        />

        <StickyKpiRow
          items={[
            { label: "My Leads", value: String(myLeads), href: "/sales", tone: "brand" },
            { label: "Quotations", value: String(myQuotations), href: "/sales?tab=quotations", tone: "warning" },
            { label: "POS Sessions", value: String(posOpen), href: "/pos", tone: "success" },
          ]}
        />

        <div className="grid gap-3 lg:grid-cols-3">
          <Link href="/sales" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">My Leads</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{myLeads}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View leads →</p>
          </Link>
          <Link href="/sales?tab=quotations" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">My Quotations</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{myQuotations}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View quotations →</p>
          </Link>
          <Link href="/pos" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Active POS</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{posOpen}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open POS →</p>
          </Link>
        </div>
      </div>
    );
  }

  if (user.role === "SALES_POS") {
    const currency = getAppCurrency();
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [openSession, todaySalesAgg] = await Promise.all([
      prisma.posSession.findFirst({
        where: { operatorId: session.user.id, status: "OPEN" },
        select: { id: true, totalSales: true, salesCount: true, openedAt: true },
      }).catch(() => null),
      prisma.posSession.aggregate({
        _sum: { totalSales: true },
        where: { operatorId: session.user.id, openedAt: { gte: todayStart } },
      }).catch(() => ({ _sum: { totalSales: null } })),
    ]);

    const todaySales = todaySalesAgg._sum.totalSales ?? 0;
    const sessionsToday = await prisma.posSession.count({
      where: { operatorId: session.user.id, openedAt: { gte: todayStart } },
    }).catch(() => 0);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Point of Sale"
          summary="Open a new session to start taking sales, or continue your active session."
          primaryHref="/pos"
          primaryLabel={openSession ? "Continue Session" : "Open New Session"}
        />

        <StickyKpiRow
          items={[
            { label: "Today's Sales", value: formatMoney(todaySales, currency), href: "/pos", tone: "success" },
            { label: "Sessions Today", value: String(sessionsToday), href: "/pos" },
          ]}
        />

        {openSession ? (
          <Link href="/pos" className="panel-shadow block rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Active Session</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Sales</p>
                <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{formatMoney(openSession.totalSales, currency)}</p>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Sales Count</p>
                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">{openSession.salesCount}</p>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Opened At</p>
                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">
                  {openSession.openedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Continue session →</p>
          </Link>
        ) : (
          <Link href="/pos" className="panel-shadow block rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">No Active Session</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Open a new POS session to start recording sales.</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Open session →</p>
          </Link>
        )}
      </div>
    );
  }

  if (user.role === "TECH_FIELD") {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [assignedJobs, completedToday] = await Promise.all([
      prisma.job.count({
        where: {
          assignedToId: session.user.id,
          status: {
            in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "IN_REPAIR"]) as JobStatus[],
          },
        },
      }),
      prisma.job.count({
        where: {
          assignedToId: session.user.id,
          status: "COMPLETED",
          completedAt: { gte: todayStart },
        },
      }),
    ]);

    return (
      <div className="space-y-4">
        <DashboardHero
          title="Field Technician"
          summary="View your assigned jobs and complete field visits."
          primaryHref="/jobs"
          primaryLabel="My Jobs"
        />

        <StickyKpiRow
          items={[
            { label: "Assigned", value: String(assignedJobs), href: "/jobs", tone: "brand" },
            { label: "Completed Today", value: String(completedToday), href: "/jobs?status=COMPLETED", tone: "success" },
          ]}
        />

        <div className="grid gap-3 grid-cols-2">
          <Link href="/jobs" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned Jobs</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{assignedJobs}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View queue →</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed Today</p>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{completedToday}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View completed →</p>
          </Link>
        </div>
      </div>
    );
  }

  const [totalJobs, openJobs, completedJobs] = await Promise.all([
    prisma.job.count(),
    prisma.job.count({
      where: {
        status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "IN_REPAIR", "READY_FOR_PICKUP", "AWAITING_APPROVAL"]) as JobStatus[] },
      },
    }),
    prisma.job.count({ where: { status: "COMPLETED" } }),
  ]);


  return (
    <div className="space-y-4">
      <DashboardHero
        title="System Overview"
        summary={`${totalJobs} total jobs · ${openJobs} open · ${completedJobs} completed`}
        primaryHref="/jobs"
        primaryLabel="Open Jobs"
        secondaryHref="/reports"
        secondaryLabel="Open Reports"
        icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
      />

      {/* Quick-link row */}
      <div className="panel-shadow grid grid-cols-3 divide-x divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {[
          { label: "Total Jobs",  value: String(totalJobs),    href: "/jobs",                                                                              color: "text-[var(--ink)]" },
          { label: "Open",        value: String(openJobs),     href: "/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP",       color: "text-[var(--accent)]" },
          { label: "Completed",   value: String(completedJobs),href: "/jobs?status=COMPLETED",                                                              color: "text-emerald-600" },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="flex flex-col items-center justify-center gap-0.5 py-3 transition hover:bg-[var(--panel-strong)]">
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[12px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">{item.label}</p>
          </Link>
        ))}
      </div>

    </div>
  );
}
