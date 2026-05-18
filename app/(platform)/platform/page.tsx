import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTotalRevenue, getMonthlyRevenue } from "@/lib/billing-events";
import { runCommercialSeedAction } from "./actions";

const STATUS_CHIP: Record<string, string> = {
  TRIALING:  "bg-blue-100  text-blue-700  border-blue-200",
  ACTIVE:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  PAST_DUE:  "bg-red-100   text-red-700   border-red-200",
  CANCELLED: "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
};

const PLAN_CHIP: Record<string, string> = {
  STARTER:    "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
  STANDARD:   "bg-sky-100    text-sky-700    border-sky-200",
  GROWTH:     "bg-amber-100  text-amber-700  border-amber-200",
  PREMIUM:    "bg-violet-100 text-violet-700 border-violet-200",
  ENTERPRISE: "bg-purple-100 text-purple-700 border-purple-200",
};

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const [orgs, totalRevenue, monthRevenue] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, plan: true, billingStatus: true,
        trialEndsAt: true, planRenewsAt: true, isActive: true, createdAt: true,
        _count: { select: { users: true, jobs: true } },
      },
    }).catch(() =>
      // Fallback if billing columns missing — run /api/admin/db-fix to add them
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true, _count: { select: { users: true, jobs: true } } },
      }).then((rows) => rows.map((r) => ({ ...r, plan: "STARTER" as const, billingStatus: "TRIALING" as const, trialEndsAt: null, planRenewsAt: null })))
    ),
    getTotalRevenue(),
    getMonthlyRevenue(),
  ]);

  const totalJobs   = orgs.reduce((s, o) => s + o._count.jobs, 0);
  const totalUsers  = orgs.reduce((s, o) => s + o._count.users, 0);
  const activeOrgs  = orgs.filter((o) => o.billingStatus === "ACTIVE").length;
  const trialOrgs   = orgs.filter((o) => o.billingStatus === "TRIALING").length;
  const pastDue     = orgs.filter((o) => o.billingStatus === "PAST_DUE").length;

  const planCounts = orgs.reduce<Record<string, number>>((acc, o) => {
    acc[o.plan] = (acc[o.plan] ?? 0) + 1;
    return acc;
  }, {});

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Organisations</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{orgs.length} registered</p>
        </div>
        <form action={runCommercialSeedAction}>
          <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--ink)]">
            + Seed Demo Data
          </button>
        </form>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "Total Orgs",   value: orgs.length,  color: "text-[var(--ink)]" },
          { label: "Paid Active",  value: activeOrgs,   color: "text-emerald-600" },
          { label: "Trialing",     value: trialOrgs,    color: "text-blue-600" },
          { label: "Past Due",     value: pastDue,      color: "text-red-600" },
          { label: "Total Users",  value: totalUsers,   color: "text-[var(--ink)]" },
          { label: "Total Jobs",   value: totalJobs,    color: "text-[var(--ink)]" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue + plan breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="col-span-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{fmtMoney(monthRevenue)}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">All-Time Revenue</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{fmtMoney(totalRevenue)}</p>
        </div>
        {(["STARTER","STANDARD","GROWTH","PREMIUM","ENTERPRISE"] as const).map((plan) => (
          <div key={plan} className={`rounded-xl border px-4 py-3 ${PLAN_CHIP[plan]}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">{plan}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{planCounts[plan] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Org table */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">All Organisations</p>
          <p className="text-[10px] text-[var(--ink-muted)]">Click a row to manage</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3 text-center">Users</th>
                <th className="px-4 py-3 text-center">Jobs</th>
                <th className="px-4 py-3 hidden lg:table-cell">Trial / Renews</th>
                <th className="px-4 py-3 hidden md:table-cell">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {orgs.map((org) => (
                <tr key={org.id} className={`transition-colors hover:bg-[var(--gold)]/5 ${!org.isActive ? "opacity-40" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--ink)]">{org.name}</p>
                    <p className="text-[11px] text-[var(--ink-muted)]">/{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PLAN_CHIP[org.plan] ?? ""}`}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[org.billingStatus] ?? ""}`}>
                      {org.billingStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-[var(--ink-muted)]">{org._count.users}</td>
                  <td className="px-4 py-3 text-center font-mono text-sm text-[var(--ink-muted)]">{org._count.jobs}</td>
                  <td className="hidden px-4 py-3 text-sm text-[var(--ink-muted)] lg:table-cell">
                    {org.billingStatus === "TRIALING" ? fmt(org.trialEndsAt) : fmt(org.planRenewsAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-[var(--ink-muted)] md:table-cell">{fmt(org.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/platform/orgs/${org.id}`}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--ink)]"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
                    No organisations yet. Click <strong>+ Seed Demo Data</strong> above to add demo orgs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
