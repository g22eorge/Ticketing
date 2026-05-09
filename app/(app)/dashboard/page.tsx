import Link from "next/link";

import { PersistedDisclosure } from "@/components/mobile/PersistedDisclosure";
import { StickyKpiRow } from "@/components/mobile/StickyKpiRow";
import { MonthSelectForm } from "@/components/shared/MonthSelectForm";
import { OnboardingChecklist, OnboardingComplete } from "@/components/shared/OnboardingChecklist";
import { RevenueLineChart } from "@/components/reports/ReportsCharts";
import { getClientBill, resolveTechCost } from "@/lib/billing";
import { formatMoney, formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { formatEATMonthLabel } from "@/lib/date-eat";
import { UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { getJobPayoutsByIds } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { getOnboardingStatus } from "@/lib/onboarding-checklist";

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

function trendMonthsSinceStartOfYear(end: Date, startMonthOverride?: number) {
  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;
  const startMonth = Math.min(endMonth, Math.max(1, startMonthOverride ?? 1));
  const count = monthCountInclusive(endYear, startMonth, endYear, endMonth);
  return monthSequence(endYear, endMonth, count);
}

function trendMonthsForYear(year: number, endMonth: number) {
  const safeMonth = Math.min(12, Math.max(1, endMonth));
  const count = monthCountInclusive(year, 1, year, safeMonth);
  return monthSequence(year, safeMonth, count);
}

async function loadRevenueMarginTrend(trendMonths: { key: string; start: Date; end: Date }[], orgId: string) {
  const completed = await prisma.job.findMany({
    where: {
      orgId,
      status: "COMPLETED",
      completedAt: { gte: trendMonths[0].start, lte: trendMonths[trendMonths.length - 1].end },
    },
    select: { id: true, clientBill: true, externalTechBill: true, completedAt: true },
  });

  // Load admin-overridden payout fees so margin uses the actual amount paid out, not just what the tech billed
  const payoutMap = await getJobPayoutsByIds(completed.map((j) => j.id)).catch(() => new Map());

  return trendMonths.map((m) => {
    const monthJobs = completed.filter((j) => j.completedAt && j.completedAt >= m.start && j.completedAt <= m.end);
    const revenue = monthJobs.reduce((sum, j) => sum + (getClientBill(j) ?? 0), 0);
    const cost = monthJobs.reduce((sum, j) => sum + resolveTechCost(payoutMap.get(j.id)?.externalTechFee, j.externalTechBill), 0);
    return { key: m.key, revenue, margin: revenue - cost };
  });
}

function RevenueMarginTrendSection({
  trendMonths,
  revenueTrend,
  currency,
}: {
  trendMonths: { key: string; start: Date; end: Date }[];
  revenueTrend: { key: string; revenue: number; margin: number }[];
  currency: string;
}) {
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Revenue & Margin Trend</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
            {trendMonths[0]?.key} – {trendMonths[trendMonths.length - 1]?.key}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-full bg-[var(--accent)]" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400/90" />
            Margin
          </span>
        </div>
      </div>

      {revenueTrend.every((m) => m.revenue === 0 && m.margin === 0) ? (
        <div className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink-muted)]">
          No completed job revenue yet for this period.
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
                <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">{m.key.slice(5)}</p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--accent)]">{formatMoneyCompact(m.revenue, currency)}</p>
                <p className={`text-[10px] ${m.margin >= 0 ? "text-emerald-600" : "text-[var(--ink)]"}`}>{formatMoneyCompact(m.margin, currency)}</p>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Repair Status Guide</p>
        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{guidance}</p>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:thin]">
        {repairFlowReference.map((step, index) => (
          <div key={step.key} className="flex shrink-0 items-center gap-2">
            <Link href={step.href} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-[1px] ${step.tone}`}>
              {step.label}
            </Link>
            {index < repairFlowReference.length - 1 ? <span className="text-[10px] text-[var(--ink-muted)]">→</span> : null}
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
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
            period === "month"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Monthly
        </Link>
        <Link
          href={yearHref}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
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
          className="ml-auto rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function DashboardHero({
  title,
  summary,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  summary: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Overview</p>
          <p className="mt-0.5 text-sm font-bold text-[var(--ink)]">{title}</p>
          <p className="mt-0.5 hidden text-[12px] leading-snug text-[var(--ink-muted)] 2xl:block">{summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Link
            href={primaryHref}
            className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90"
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-[11px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/30 hover:text-[var(--accent)]"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user, orgId } = await requireOrgSession();
  const permissionUser = { role: user.role, permissions: user.permissions };
  const filters = await searchParams;
  const period: "month" | "year" = filters.period === "year" ? "year" : "month";

  // Only fetch onboarding status for ADMIN users (they're the ones who act on it).
  const onboarding = user.role === "ADMIN" ? await getOnboardingStatus(orgId) : null;

  if (user.role === "TECHNICIAN_EXTERNAL") {
    const selectedMonth = parseMonth(filters.month);
    const selectedYear = Number(filters.year) || new Date().getFullYear();
    const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
    const selectedPeriodLabel = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
    const selectablePeriods = period === "year" ? yearOptions(6) : monthOptions(18);

    const jobs = await prisma.job.findMany({
      where: {
        orgId,
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
    const openCount = jobs.filter((job) => [
      "RECEIVED",
      "DIAGNOSING",
      "REFERRED",
      "IN_EXTERNAL_REPAIR",
      "AWAITING_APPROVAL",
      "IN_REPAIR",
      "READY_FOR_PICKUP",
    ].includes(job.status)).length;
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
          summary="Use this board to progress active work orders quickly and keep payout clearance in sync from one workspace."
          primaryHref="/technicians"
          primaryLabel="Open Work Queue"
          secondaryHref="/technicians/payouts"
          secondaryLabel="Review Payouts"
        />

        <StickyKpiRow
          items={[
            { label: "Assigned", value: String(jobs.length), href: "/technicians" },
            { label: "Open", value: String(openCount), href: "/technicians?ready=1", tone: "brand" },
            { label: "Completed", value: String(completedCount), href: "/jobs?status=COMPLETED", tone: "success" },
            { label: "Outstanding", value: formatMoneyCompact(outstandingTotal, currency), href: "/technicians/payouts", tone: "warning" },
          ]}
        />

        <div className="hidden gap-3 2xl:grid 2xl:grid-cols-4">
          <Link href="/technicians" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned Jobs ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold sm:text-4xl">{jobs.length}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Open queue →</p>
          </Link>
          <Link href="/technicians?ready=1" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open Jobs ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)] sm:text-4xl">{openCount}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Jobs needing action →</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)] sm:text-4xl">{completedCount}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Completed jobs →</p>
          </Link>
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Payout Outstanding</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{formatMoneyCompact(outstandingTotal, currency)}</p>
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
        orgId,
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
          orgId,
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
      orgId,
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
          summary="Keep diagnostics, repairs, and handoffs flowing from this workspace, then jump directly into the next action queue."
          primaryHref="/jobs"
          primaryLabel="Open Assigned Jobs"
          secondaryHref={canUpdatePricing ? "/jobs?pricing=needs&status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" : "/jobs?status=DIAGNOSING"}
          secondaryLabel={canUpdatePricing ? "Resolve Pricing Queue" : "Focus Diagnosis Queue"}
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)] sm:text-[11px]">Pricing Controls</p>
              <p className="mt-0.5 text-xs text-[var(--ink)] sm:text-sm">You can update client pricing directly from job Financials.</p>
            </div>
            <div className="grid gap-2 p-3 grid-cols-2 sm:grid-cols-3">
              <Link href="/jobs?status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">Needs Pricing</p>
                <p className="mt-1 text-lg font-semibold text-[var(--accent)]">{pricingPendingCount}</p>
              </Link>
              <Link href="/jobs?status=AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP,COMPLETED" className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--accent)]">Priced Jobs</p>
                <p className="mt-1 text-lg font-semibold text-[var(--accent)]">{pricedCount}</p>
              </Link>
              <Link href="/jobs?pricing=priced" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-center col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Margin</p>
                <p className={`mt-1 text-sm font-semibold ${marginTotal >= 0 ? "text-[var(--accent)]" : "text-black"}`}>
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
                    <span className="shrink-0 text-[10px] text-[var(--ink-muted)]">
                      {statusLabel[job.status as keyof typeof statusLabel] ?? job.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PersistedDisclosure>

        <div className="hidden gap-3 2xl:grid 2xl:grid-cols-4">
          <Link href="/jobs" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold sm:text-4xl">{assignedJobs.length}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">View my jobs →</p>
          </Link>
          <Link href="/jobs?status=DIAGNOSING" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Diagnosing ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)] sm:text-4xl">{diagnosing}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Needs diagnosis work →</p>
          </Link>
          <Link href="/jobs?status=IN_REPAIR" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">In Repair ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)] sm:text-4xl">{inRepair}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Active repairs →</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)] sm:text-4xl">{completed}</p>
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">Completed repairs →</p>
          </Link>
        </div>

        <div className="panel-shadow hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 2xl:block">
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

  if (user.role === "ADMIN") {
    const currency = getAppCurrency();
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const mtdStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);

    const [
      statusGroup,
      completedMtd,
      externalCompleted,
      clientUnpaidCount,
      cashInMtdAgg,
      posCashInMtdAgg,
      earliestJob,
      receivedToday,
      completedToday,
      pendingRequests,
      overdueJobs,
      techWorkloadJobs,
      unassignedActiveCount,
    ] = await Promise.all([
      prisma.job.groupBy({ by: ["status"], where: { orgId }, _count: { status: true } }),
      prisma.job.findMany({
        where: { orgId, status: "COMPLETED", completedAt: { gte: mtdStart, lte: today } },
        select: { clientBill: true },
      }),
      prisma.job.findMany({
        where: {
          orgId,
          repairPath: "EXTERNAL",
          externalPaid: false,
          status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] },
        },
        select: { id: true, externalTechBill: true },
      }),
      prisma.job.count({
        where: { orgId, clientBill: { gt: 0 }, clientPaid: false, status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] } },
      }).catch(() => 0),
      prisma.payment.aggregate({
        where: { orgId, receivedAt: { gte: mtdStart, lte: today } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.payment.aggregate({
        where: { orgId, receivedAt: { gte: mtdStart, lte: today }, saleId: { not: null } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.job.findFirst({ where: { orgId }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }).catch(() => null),
      prisma.job.count({ where: { orgId, receivedAt: { gte: todayStart } } }),
      prisma.job.count({ where: { orgId, completedAt: { gte: todayStart } } }),
      prisma.repairRequest.count({ where: { orgId, requestStatus: { in: ["PENDING_FRONT_DESK", "PENDING_INTAKE"] } } }).catch(() => 0),
      prisma.job.findMany({
        where: {
          orgId,
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR", "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL"]) as JobStatus[] },
          receivedAt: { lt: threeDaysAgo },
        },
        select: { id: true, jobNumber: true, status: true, receivedAt: true, device: { select: { brand: true, model: true } } },
        orderBy: { receivedAt: "asc" },
        take: 10,
      }).catch(async () => {
        const fallback = await prisma.job.findMany({
          where: {
            orgId,
            status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR", "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL"]) as JobStatus[] },
            receivedAt: { lt: threeDaysAgo },
          },
          select: { id: true, jobNumber: true, status: true, receivedAt: true },
          orderBy: { receivedAt: "asc" },
          take: 10,
        });

        return fallback.map((job) => ({ ...job, device: null }));
      }),
      prisma.job.findMany({
        where: {
          orgId,
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] },
          assignedToId: { not: null },
        },
        select: { status: true, assignedTo: { select: { id: true, name: true, role: true } } },
      }),
      prisma.job.count({
        where: {
          orgId,
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_REPAIR", "IN_EXTERNAL_REPAIR", "WAITING_FOR_PARTS", "RETURNED_FROM_EXTERNAL"]) as JobStatus[] },
          assignedToId: null,
        },
      }),
    ]);

    const payoutMap = await getJobPayoutsByIds(externalCompleted.map((job) => job.id)).catch(() => new Map());
    // externalCompleted already pre-filtered to externalPaid=false in the DB query
    const payoutOutstanding = externalCompleted
      .reduce((sum, job) => sum + resolveTechCost(payoutMap.get(job.id)?.externalTechFee, job.externalTechBill), 0);
    const techPayoutCount = externalCompleted.length;

    const revenueMtd = completedMtd
      .filter((job) => getClientBill(job) !== null)
      .reduce((sum, job) => sum + (getClientBill(job) ?? 0), 0);

    const cashInMtd = cashInMtdAgg._sum.amount ?? 0;
    const posCashInMtd = posCashInMtdAgg._sum.amount ?? 0;

    const statusCount = new Map<string, number>();
    for (const item of statusGroup) {
      const key = normalizeJobStatus(item.status as JobStatus);
      statusCount.set(key, (statusCount.get(key) ?? 0) + item._count.status);
    }

    const statusData = UI_JOB_STATUSES.map((status) => ({
      key: status,
      name: statusLabel[status],
      value: statusCount.get(status) ?? 0,
    }));

    const awaitingApprovalCount = statusCount.get("AWAITING_APPROVAL") ?? 0;
    const overdueWithDays = overdueJobs.map((job) => ({
      ...job,
      ageDays: Math.floor((today.getTime() - job.receivedAt.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    const techWorkloadMap = new Map<string, { id: string; name: string; role: string; count: number }>();
    for (const job of techWorkloadJobs) {
      if (!job.assignedTo) continue;
      const existing = techWorkloadMap.get(job.assignedTo.id) ?? {
        id: job.assignedTo.id,
        name: job.assignedTo.name,
        role: job.assignedTo.role,
        count: 0,
      };
      existing.count += 1;
      techWorkloadMap.set(job.assignedTo.id, existing);
    }
    const techWorkloadRows = [...techWorkloadMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    const hasAlerts = overdueWithDays.length > 0 || awaitingApprovalCount > 0 || pendingRequests > 0 || unassignedActiveCount > 0;
    const mtdLabel = monthLabel(today.getFullYear(), today.getMonth() + 1);

    const startMonthOverride = earliestJob?.receivedAt && earliestJob.receivedAt.getFullYear() === today.getFullYear()
      ? earliestJob.receivedAt.getMonth() + 1
      : 1;
    const trendMonths = trendMonthsSinceStartOfYear(today, startMonthOverride);
    const revenueTrend = await loadRevenueMarginTrend(trendMonths, orgId);

    return (
      <div className="space-y-4">
        {/* Onboarding checklist — shown to ADMIN on new workspaces */}
        {onboarding?.show && (
          <OnboardingChecklist
            orgId={orgId}
            steps={onboarding.steps}
            doneCount={onboarding.doneCount}
            totalCount={onboarding.totalCount}
          />
        )}
        {/* All steps done — one-time celebration */}
        {onboarding && !onboarding.show &&
          onboarding.doneCount === onboarding.totalCount && (
          <OnboardingComplete orgId={orgId} />
        )}

        {/* Alert Banner */}
        {hasAlerts ? (
          <section className="panel-shadow rounded-xl border border-[var(--accent)]/25 bg-[var(--panel)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Attention Required</span>
              {awaitingApprovalCount > 0 ? (
                <Link
                  href="/jobs?status=AWAITING_APPROVAL"
                  className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:border-[var(--accent)]/50"
                >
                  {awaitingApprovalCount} awaiting approval
                </Link>
              ) : null}
              {overdueWithDays.length > 0 ? (
                <span className="rounded-full border border-white/10 bg-[#0b0b0b] px-2.5 py-1 text-[11px] font-medium text-white/90">
                  {overdueWithDays.length} overdue (3+ days)
                </span>
              ) : null}
              {unassignedActiveCount > 0 ? (
                <Link
                  href="/jobs?assignedToId=unassigned"
                  className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/35"
                >
                  {unassignedActiveCount} unassigned
                </Link>
              ) : null}
              {pendingRequests > 0 ? (
                <Link
                  href="/intake"
                  className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/35"
                >
                  {pendingRequests} pending requests
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={revenueTrend} currency={currency} />

        {/* Live Repair Pipeline — with today's stats and quick actions in the header */}
        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Live Repair Pipeline</p>
              <Link href="/jobs" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">View all →</Link>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Link
                href={`/jobs?from=${asDateInputValue(todayStart)}&to=${asDateInputValue(today)}`}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--accent)]/30"
              >
                <span className="text-[var(--ink-muted)]">In </span>
                <span className="font-semibold text-[var(--ink)]">{receivedToday}</span>
                <span className="mx-1 text-[var(--ink-muted)]">·</span>
                <span className="text-[var(--ink-muted)]">Out </span>
                <span className="font-semibold text-[var(--accent)]">{completedToday}</span>
                <span className="ml-1 text-[var(--ink-muted)]">today</span>
              </Link>
              <Link
                href="/reports"
                className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:border-emerald-500/40"
              >
                Cash in {formatMoney(cashInMtd, currency)}
              </Link>
              <Link
                href="/pos"
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/30 hover:text-[var(--ink)]"
              >
                POS {formatMoney(posCashInMtd, currency)}
              </Link>
              <Link
                href="/payout-followups"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  clientUnpaidCount > 0 || techPayoutCount > 0
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[#9A7A00] hover:border-[var(--accent)]/60"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                Finance · {clientUnpaidCount + techPayoutCount}
              </Link>
              <Link
                href="/jobs?status=AWAITING_APPROVAL"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  awaitingApprovalCount > 0
                    ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)] hover:border-[var(--accent)]/55"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                Awaiting {awaitingApprovalCount}
              </Link>
              <Link
                href="/jobs?status=DIAGNOSING,REFERRED,AWAITING_APPROVAL,IN_REPAIR"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  overdueWithDays.length > 0
                    ? "border-white/10 bg-[#0b0b0b] text-white/90 hover:border-white/20"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                Overdue {overdueWithDays.length}
              </Link>
              <Link
                href="/jobs?assignedToId=unassigned"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  unassignedActiveCount > 0
                    ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]/30"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                Unassigned {unassignedActiveCount}
              </Link>
              <Link
                href="/intake"
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  pendingRequests > 0
                    ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:border-[var(--accent)]/30"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                }`}
              >
                Requests {pendingRequests}
              </Link>
            </div>
          </div>
          <div className="flex snap-x overflow-x-auto [scrollbar-width:thin]">
            {statusData
              .filter((s) => s.key !== "CLOSED")
              .map((s) => {
                const isUrgent = s.key === "AWAITING_APPROVAL" && s.value > 0;
                const isReady = s.key === "READY_FOR_PICKUP" && s.value > 0;
                const isCompleted = s.key === "COMPLETED";
                return (
                  <Link
                    key={s.key}
                    href={`/jobs?status=${s.key}`}
                    className={[
                      "flex min-w-[88px] shrink-0 flex-col items-center border-r border-[var(--line)] px-3 py-3.5 text-center transition hover:bg-[var(--panel-strong)] last:border-r-0",
                      isUrgent ? "bg-[var(--accent)]/5" : "",
                    ].join(" ")}
                  >
                    <p className={`text-xl font-bold ${s.value === 0 ? "text-[var(--ink-muted)]" : isUrgent ? "text-[var(--accent)]" : isReady ? "text-[var(--accent)]" : isCompleted ? "text-emerald-600" : "text-[var(--ink)]"}`}>
                      {s.value}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-tight text-[var(--ink-muted)]">{s.name}</p>
                  </Link>
                );
              })}
          </div>
          <div className="border-t border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Finance Outlook</p>
              <Link href={`/reports?period=month&month=${mtdLabel}`} className="text-[11px] font-semibold text-[var(--accent)] hover:underline">Open reports →</Link>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Link href={`/reports?period=month&month=${mtdLabel}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 transition hover:border-[var(--accent)]/35">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Revenue MTD</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-700">{formatMoney(revenueMtd, currency)}</p>
              </Link>
              <Link href="/payout-followups" className={`rounded-lg border px-3 py-2 transition ${clientUnpaidCount > 0 || payoutOutstanding > 0 ? "border-[var(--accent)]/35 bg-[var(--accent)]/10 hover:border-[var(--accent)]/60" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]/35"}`}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Unpaid Bills</p>
                <p className={`mt-0.5 text-sm font-semibold ${clientUnpaidCount > 0 ? "text-[#9A7A00]" : "text-[var(--ink)]"}`}>{clientUnpaidCount} client{clientUnpaidCount !== 1 ? "s" : ""}</p>
              </Link>
              <Link href={`/jobs?status=COMPLETED&dateField=completedAt&from=${asDateInputValue(mtdStart)}&to=${asDateInputValue(today)}`} className="col-span-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 transition hover:border-[var(--accent)]/35 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed MTD</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{completedMtd.length}</p>
              </Link>
            </div>
          </div>
        </section>

        {/* Needs Attention + Technician Workload */}
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Needs Attention</p>
              {overdueWithDays.length > 0 || unassignedActiveCount > 0 ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  {overdueWithDays.length + unassignedActiveCount}
                </span>
              ) : null}
            </div>
            {overdueWithDays.length === 0 && unassignedActiveCount === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-[11px] font-medium text-emerald-700">All clear — no issues.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {unassignedActiveCount > 0 ? (
                  <Link
                    href="/jobs?assignedToId=unassigned"
                    className="flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 transition hover:border-violet-300"
                  >
                    <p className="text-xs font-semibold text-violet-800">Unassigned active jobs</p>
                    <span className="ml-2 shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{unassignedActiveCount}</span>
                  </Link>
                ) : null}
                {overdueWithDays.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-amber-200"
                  >
                    <div className="min-w-0">
                      <p className="mono truncate text-xs font-bold text-[var(--accent)]">{job.jobNumber}</p>
                      <p className="truncate text-[10px] text-[var(--ink-muted)]">
                        {[job.device?.brand, job.device?.model].filter(v => v && v !== "Unknown").join(" ") || "Device"}
                        <span className="mx-1 text-[var(--line)]">·</span>
                        {statusLabel[job.status as keyof typeof statusLabel] ?? job.status}
                      </p>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${job.ageDays >= 8 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {job.ageDays}d
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Technician Workload</p>
            {techWorkloadRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No jobs currently assigned.</p>
            ) : (
              <div className="space-y-1.5">
                {techWorkloadRows.map((tech) => (
                  <Link key={tech.id} href={`/jobs?assignedToId=${tech.id}`} className="group flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/35 hover:bg-[var(--panel)]">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold transition-colors group-hover:text-[var(--accent)]">{tech.name}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">
                        {tech.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"}
                      </p>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tech.role === "TECHNICIAN_EXTERNAL" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
                      {tech.count} active
                    </span>
                  </Link>
                ))}
              </div>
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

    const [completedThisMonth, pendingBilling, externalCompleted, cashInAgg, repairCashInAgg, posCashInAgg, invoiceAgg, saleAgg] = await Promise.all([
      prisma.job.findMany({
        where: { orgId, status: "COMPLETED", completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        select: { id: true, jobNumber: true, completedAt: true, clientBill: true },
      }),
      prisma.job.count({
        where: {
          orgId,
          status: { in: ["IN_REPAIR", "READY_FOR_PICKUP", "AWAITING_APPROVAL"] },
        },
      }),
      prisma.job.findMany({
        where: {
          orgId,
          repairPath: "EXTERNAL",
          externalPaid: false,
          status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] },
        },
        select: { id: true, externalTechBill: true },
      }),
      prisma.payment.aggregate({
        where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.payment.aggregate({
        where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end }, invoiceId: { not: null } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.payment.aggregate({
        where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end }, saleId: { not: null } },
        _sum: { amount: true },
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.invoice.aggregate({
        where: { orgId, issuedAt: { gte: selectedRange.start, lte: selectedRange.end } },
        _sum: { totalAmount: true, paidAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0, paidAmount: 0 } })),
      prisma.sale.aggregate({
        where: { orgId, createdAt: { gte: selectedRange.start, lte: selectedRange.end }, status: { not: "VOID" } },
        _sum: { totalAmount: true, paidAmount: true },
      }).catch(() => ({ _sum: { totalAmount: 0, paidAmount: 0 } })),
    ]);

    const cashIn = cashInAgg._sum.amount ?? 0;
    const repairCashIn = repairCashInAgg._sum.amount ?? 0;
    const posCashIn = posCashInAgg._sum.amount ?? 0;
    const invoiceIssued = invoiceAgg._sum.totalAmount ?? 0;
    const invoiceIssuedPaid = invoiceAgg._sum.paidAmount ?? 0;
    const invoiceIssuedBalance = Math.max(0, invoiceIssued - invoiceIssuedPaid);
    const posTotal = saleAgg._sum.totalAmount ?? 0;
    const posPaid = saleAgg._sum.paidAmount ?? 0;
    const posBalance = Math.max(0, posTotal - posPaid);

    const revenueTrend = await loadRevenueMarginTrend(trendMonths, orgId);

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

        <StickyKpiRow
          items={[
            { label: "Cash In", value: formatMoneyCompact(cashIn, currency), href: reportHref },
            { label: "Pending", value: String(pendingBilling), href: "/jobs?status=IN_REPAIR,READY_FOR_PICKUP,AWAITING_APPROVAL", tone: "warning" },
            { label: "Payouts", value: formatMoneyCompact(payoutOutstanding, currency), href: "/reports", tone: "brand" },
            { label: "Completed", value: String(completedThisMonth.length), href: "/jobs?status=COMPLETED", tone: "success" },
          ]}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
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
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Cash Exposure</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span>Cash in ({selectedPeriodLabel})</span>
                <span className="font-semibold">{formatMoneyCompact(cashIn, currency)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                  <span>Repairs cash in</span>
                  <span className="font-semibold">{formatMoneyCompact(repairCashIn, currency)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                  <span>POS cash in</span>
                  <span className="font-semibold">{formatMoneyCompact(posCashIn, currency)}</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                  <span>Invoice balance</span>
                  <span className="font-semibold">{formatMoneyCompact(invoiceIssuedBalance, currency)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                  <span>POS balance</span>
                  <span className="font-semibold">{formatMoneyCompact(posBalance, currency)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span>External payouts due</span>
                <span className="font-semibold">{formatMoneyCompact(payoutOutstanding, currency)}</span>
              </div>
              <Link href={reportHref} className="mt-1 inline-flex text-xs font-semibold text-[var(--accent)] hover:underline">Open detailed finance reports →</Link>
            </div>
          </section>
        </div>

        <RevenueMarginTrendSection trendMonths={trendMonths} revenueTrend={revenueTrend} currency={currency} />

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
          orgId,
          createdById: session.user.id,
          receivedAt: { gte: selectedRange.start, lte: selectedRange.end },
        },
      }),
      prisma.job.count({
        where: {
          orgId,
          createdById: session.user.id,
          status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"]) as JobStatus[] },
        },
      }),
      prisma.job.count({ where: { orgId, status: "AWAITING_APPROVAL" } }),
      prisma.job.count({ where: { orgId, status: "READY_FOR_PICKUP" } }),
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
          summary="Capture requests quickly, keep client communication consistent, and move each intake through approval to handover."
          primaryHref="/jobs/new"
          primaryLabel="Capture New Job"
          secondaryHref="/jobs?status=AWAITING_APPROVAL"
          secondaryLabel="Open Approval Queue"
        />

        <div className="hidden 2xl:block">
          <RepairStatusReference
            title="Intake to Delivery Flow"
            guidance="Keep this sequence in view when briefing clients so status updates are clear and consistent."
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:hidden">
          <Link href="/jobs/new" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-center transition hover:-translate-y-[1px]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Captured</p>
            <p className="mt-1 text-3xl font-semibold">{capturedThisMonth}</p>
            <p className="mt-1 text-[11px] font-medium text-[var(--accent)]">New intake →</p>
          </Link>
          <Link href="/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-center transition hover:-translate-y-[1px]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open</p>
            <p className="mt-1 text-3xl font-semibold text-[var(--accent)]">{openFromIntake}</p>
            <p className="mt-1 text-[11px] font-medium text-[var(--accent)]">In progress →</p>
          </Link>
          <Link href="/jobs?status=AWAITING_APPROVAL" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-center transition hover:-translate-y-[1px]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Approval</p>
            <p className="mt-1 text-3xl font-semibold text-[var(--accent)]">{awaitingApproval}</p>
            <p className="mt-1 text-[11px] font-medium text-[var(--accent)]">Follow up →</p>
          </Link>
          <Link href="/jobs?status=READY_FOR_PICKUP" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-center transition hover:-translate-y-[1px]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Ready</p>
            <p className="mt-1 text-3xl font-semibold text-[var(--accent)]">{readyForPickup}</p>
            <p className="mt-1 text-[11px] font-medium text-[var(--accent)]">Pickup →</p>
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Link href="/jobs/new" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Captured ({selectedPeriodLabel})</p>
            <p className="mt-2 text-3xl font-semibold">{capturedThisMonth}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open intake form →</p>
          </Link>
          <Link href="/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open client queue</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{openFromIntake}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">View open jobs →</p>
          </Link>
          <Link href="/jobs?status=AWAITING_APPROVAL" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Awaiting approval</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{awaitingApproval}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open approval queue →</p>
          </Link>
          <Link href="/jobs?status=READY_FOR_PICKUP" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Ready for pickup</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{readyForPickup}</p>
            <p className="mt-2 text-xs font-medium text-[var(--accent)]">Open pickup list →</p>
          </Link>
        </div>
      </div>
    );
  }

  const [totalJobs, openJobs, completedJobs] = await Promise.all([
    prisma.job.count({ where: { orgId } }),
    prisma.job.count({
      where: {
        orgId,
        status: { in: filterSupportedJobStatuses(["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "IN_REPAIR", "READY_FOR_PICKUP", "AWAITING_APPROVAL"]) as JobStatus[] },
      },
    }),
    prisma.job.count({ where: { orgId, status: "COMPLETED" } }),
  ]);


  return (
    <div className="space-y-4">
      <DashboardHero
        title="System Overview"
        summary="Use this overview to orient team focus, then open the queue and reporting workspaces for deeper action."
        primaryHref="/jobs"
        primaryLabel="Open Jobs"
        secondaryHref="/reports"
        secondaryLabel="Open Reports"
      />

      <StickyKpiRow
        items={[
          { label: "Total", value: String(totalJobs), href: "/jobs" },
          { label: "Open", value: String(openJobs), href: "/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP", tone: "brand" },
          { label: "Completed", value: String(completedJobs), href: "/jobs?status=COMPLETED", tone: "success" },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Link href="/jobs" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Jobs</p>
          <p className="mt-2 text-3xl font-semibold">{totalJobs}</p>
          <p className="mt-2 text-xs font-medium text-[var(--accent)]">View all jobs →</p>
        </Link>
        <Link
          href="/jobs?status=RECEIVED,DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR,READY_FOR_PICKUP"
          className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open Jobs</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{openJobs}</p>
          <p className="mt-2 text-xs font-medium text-[var(--accent)]">View open queue →</p>
        </Link>
        <Link
          href="/jobs?status=COMPLETED"
          className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] sm:p-5"
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Completed</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{completedJobs}</p>
          <p className="mt-2 text-xs font-medium text-[var(--accent)]">View completed jobs →</p>
        </Link>
      </div>

    </div>
  );
}
