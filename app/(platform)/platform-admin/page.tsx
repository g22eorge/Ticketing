// @ts-nocheck
import { prisma } from "@/lib/prisma";
import { getTotalRevenue, getMonthlyRevenue } from "@/lib/billing-events";
import { OrgTable } from "../platform/OrgTable";
import type { OrgRow } from "../platform/OrgTable";
import { planLabel } from "@/lib/plan-labels";

export const dynamic = "force-dynamic";

type OrgQueryRow = { id: string; name: string; slug: string; plan: string; isActive: boolean; createdAt: Date; users: { id: string }[] };

export default async function PlatformPage() {
  let rawOrgs: OrgQueryRow[] = [];
  let totalRevenue = 0;
  let monthRevenue = 0;
  let jobsByOrg = new Map<string, number>();

  try {
    const [orgsResult, totalRev, monthRev] = await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, slug: true, plan: true,
          isActive: true, createdAt: true,
          users: { select: { id: true } },
        },
      }),
      getTotalRevenue(),
      getMonthlyRevenue(),
    ]);
    rawOrgs = orgsResult;
    totalRevenue = totalRev;
    monthRevenue = monthRev;
  } catch { /* show empty state if DB unreachable */ }

  try {
    // Count jobs per org separately (Job has orgId but Organisation has no jobs relation)
    const jobCounts = await prisma.job.groupBy({ by: ["orgId"], _count: { _all: true } });
    jobsByOrg = new Map(jobCounts.map((r) => [r.orgId, r._count._all]));
  } catch { /* jobCount stays 0 */ }

  const orgs: OrgRow[] = rawOrgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    isActive: o.isActive,
    createdAt: o.createdAt,
    userCount: o.users.length,
    jobCount: jobsByOrg.get(o.id) ?? 0,
  }));

  const totalUsers = orgs.reduce((s, o) => s + o.userCount, 0);
  const totalJobs  = orgs.reduce((s, o) => s + o.jobCount, 0);
  const activeOrgs = orgs.filter((o) => o.isActive).length;

  const planCounts = orgs.reduce<Record<string, number>>((acc, o) => {
    acc[o.plan] = (acc[o.plan] ?? 0) + 1;
    return acc;
  }, {});

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);

  const PLAN_CHIP: Record<string, string> = {
    FREE:         "border-[var(--line)]      bg-[var(--panel-strong)] text-[var(--ink-muted)]",
    STARTER:      "border-sky-400/30         bg-sky-500/10    text-sky-700    dark:text-sky-400",
    PROFESSIONAL: "border-amber-400/30       bg-amber-500/10  text-amber-700  dark:text-amber-400",
    ENTERPRISE:   "border-purple-400/30      bg-purple-500/10 text-purple-700 dark:text-purple-400",
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Organisations</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{orgs.length} registered · {activeOrgs} active</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: "Total Orgs",  value: orgs.length,  color: "text-[var(--ink)]" },
          { label: "Active",      value: activeOrgs,   color: "text-emerald-600" },
          { label: "Inactive",    value: orgs.length - activeOrgs, color: "text-[var(--ink-muted)]" },
          { label: "Total Users", value: totalUsers,   color: "text-[var(--ink)]" },
          { label: "Total Jobs",  value: totalJobs,    color: "text-[var(--ink)]" },
          { label: "This Month",  value: fmtMoney(monthRevenue), color: "text-emerald-600" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue + plan breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">All-Time Revenue</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{fmtMoney(totalRevenue)}</p>
        </div>
        {(["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const).map((plan) => (
          <div key={plan} className={`rounded-xl border px-4 py-3 ${PLAN_CHIP[plan]}`}>
            <p className="text-[12px] font-bold uppercase tracking-[0.15em] opacity-70">{planLabel(plan)}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{planCounts[plan] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Org table */}
      <OrgTable orgs={orgs} />

    </div>
  );
}
