import { redirect } from "next/navigation";
import { TargetMetric, TargetPeriod } from "@prisma/client";

import { formatMoney, getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { SetTargetDialog } from "./SetTargetDialog";

type SearchParams = Promise<{ period?: string; label?: string }>;

const METRIC_LABELS: Record<TargetMetric, string> = {
  REVENUE: "Revenue",
  JOBS_COMPLETED: "Jobs Completed",
  LEADS_CONVERTED: "Leads Converted",
  QUOTATIONS_SENT: "Quotations Sent",
  POS_SALES: "POS Sales",
  SALES_COUNT: "Sales Count",
  CUSTOMER_SATISFACTION: "Customer Satisfaction",
  RESPONSE_TIME_HOURS: "Response Time (Hours)",
};

const PERIOD_OPTIONS: { value: TargetPeriod; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUAL", label: "Annual" },
];

function currentPeriodLabel(period: TargetPeriod): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  if (period === "QUARTERLY") return `${year}-Q${quarter}`;
  if (period === "ANNUAL") return `${year}`;
  return `${year}-${month}`;
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-red-500";
}

function progressTextColor(pct: number): string {
  if (pct >= 100) return "text-green-600 dark:text-green-400";
  if (pct >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function formatValue(metric: TargetMetric, value: number, currency: string): string {
  if (metric === "REVENUE") return formatMoney(value, currency);
  return value.toLocaleString();
}

type TargetRecord = {
  id: string;
  entityName: string;
  metric: TargetMetric;
  targetValue: number;
  actualValue: number;
};

function TargetCard({ target, currency }: { target: TargetRecord; currency: string }) {
  const pct = target.targetValue > 0 ? Math.min(Math.round((target.actualValue / target.targetValue) * 100), 100) : 0;
  const rawPct = target.targetValue > 0 ? (target.actualValue / target.targetValue) * 100 : 0;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">{target.entityName}</p>
          <p className="text-xs text-[var(--ink-muted)]">{METRIC_LABELS[target.metric]}</p>
        </div>
        <span className={`shrink-0 text-sm font-bold tabular-nums ${progressTextColor(rawPct)}`}>
          {rawPct >= 100 ? "100" : rawPct.toFixed(0)}%
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className={`h-2 rounded-full transition-all ${progressColor(rawPct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-2 flex justify-between text-xs text-[var(--ink-muted)]">
        <span>Actual: <span className="font-medium text-[var(--ink)]">{formatValue(target.metric, target.actualValue, currency)}</span></span>
        <span>Target: <span className="font-medium text-[var(--ink)]">{formatValue(target.metric, target.targetValue, currency)}</span></span>
      </div>
    </div>
  );
}

function TargetSection({ title, targets, currency }: { title: string; targets: TargetRecord[]; currency: string }) {
  return (
    <section>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">{title}</p>
      {targets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-muted)]">
          No targets set for this period.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {targets.map((t) => (
            <TargetCard key={t.id} target={t} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function TargetsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, orgId } = await requireOrgSession();

  const canSet = can.setTargets(user);
  const canView = can.viewTeamTargets(user);

  if (!canSet && !canView) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const period = (PERIOD_OPTIONS.find((o) => o.value === params.period)?.value ?? "MONTHLY") as TargetPeriod;
  const label = params.label ?? currentPeriodLabel(period);
  const currency = getAppCurrency();

  const [rawTargets, allUsers, departments, branches] = await Promise.all([
    prisma.salesTarget.findMany({
      where: { orgId, period, periodLabel: label },
      include: {
        user: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
    canSet
      ? prisma.user.findMany({
          where: { orgId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    canSet
      ? prisma.department.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }).catch(() => [] as { id: string; name: string }[])
      : Promise.resolve([] as { id: string; name: string }[]),
    canSet
      ? prisma.branch.findMany({
          where: { orgId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const userTargets: TargetRecord[] = rawTargets
    .filter((t) => t.entityType === "USER" && t.user)
    .map((t) => ({
      id: t.id,
      entityName: t.user!.name,
      metric: t.metric,
      targetValue: t.targetValue,
      actualValue: t.actualValue,
    }));

  const departmentTargets: TargetRecord[] = rawTargets
    .filter((t) => t.entityType === "DEPARTMENT" && t.department)
    .map((t) => ({
      id: t.id,
      entityName: t.department!.name,
      metric: t.metric,
      targetValue: t.targetValue,
      actualValue: t.actualValue,
    }));

  const branchTargets: TargetRecord[] = rawTargets
    .filter((t) => t.entityType === "BRANCH" && t.branch)
    .map((t) => ({
      id: t.id,
      entityName: t.branch!.name,
      metric: t.metric,
      targetValue: t.targetValue,
      actualValue: t.actualValue,
    }));

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Analytics</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Targets &amp; Productivity</p>
            <p className="text-[11px] text-[var(--ink-muted)]">{periodLabel} — {label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-0.5" method="GET" action="/targets">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="submit"
                  name="period"
                  value={opt.value}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    period === opt.value
                      ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </form>
            {canSet && (
              <SetTargetDialog users={allUsers} departments={departments} branches={branches} />
            )}
          </div>
        </div>
      </div>

      <TargetSection title="User Targets" targets={userTargets} currency={currency} />
      <TargetSection title="Department Targets" targets={departmentTargets} currency={currency} />
      <TargetSection title="Branch Targets" targets={branchTargets} currency={currency} />
    </div>
  );
}
