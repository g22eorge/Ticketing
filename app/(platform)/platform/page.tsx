import { prisma } from "@/lib/prisma";
import { getTotalRevenue, getMonthlyRevenue } from "@/lib/billing-events";
import { runCommercialSeedAction } from "./actions";
import { OrgTable } from "./OrgTable";
import type { OrgRow } from "./OrgTable";

const PLAN_CHIP: Record<string, string> = {
  STARTER:    "bg-[var(--panel-strong)] text-[var(--ink-muted)] border-[var(--line)]",
  STANDARD:   "bg-sky-500/10    text-sky-700    border-sky-400/30    dark:text-sky-400",
  GROWTH:     "bg-amber-500/10  text-amber-700  border-amber-400/30  dark:text-amber-400",
  PREMIUM:    "bg-violet-500/10 text-violet-700 border-violet-400/30 dark:text-violet-400",
  ENTERPRISE: "bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400",
};

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const [rawOrgs, totalRevenue, monthRevenue] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, plan: true, billingStatus: true,
        trialEndsAt: true, planRenewsAt: true, isActive: true, createdAt: true,
        _count: { select: { users: true, jobs: true } },
      },
    }).catch(() =>
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true, _count: { select: { users: true, jobs: true } } },
      }).then((rows) => rows.map((r) => ({ ...r, plan: "STARTER" as const, billingStatus: "TRIALING" as const, trialEndsAt: null, planRenewsAt: null })))
    ),
    getTotalRevenue(),
    getMonthlyRevenue(),
  ]);

  // Serialise dates so the client component receives plain objects
  const orgs: OrgRow[] = rawOrgs.map((o) => ({
    ...o,
    trialEndsAt: o.trialEndsAt ?? null,
    planRenewsAt: o.planRenewsAt ?? null,
  }));

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalJobs   = orgs.reduce((s, o) => s + o._count.jobs, 0);
  const totalUsers  = orgs.reduce((s, o) => s + o._count.users, 0);
  const activeOrgs  = orgs.filter((o) => o.billingStatus === "ACTIVE").length;
  const trialOrgs   = orgs.filter((o) => o.billingStatus === "TRIALING").length;
  const pastDue     = orgs.filter((o) => o.billingStatus === "PAST_DUE").length;
  const cancelled   = orgs.filter((o) => o.billingStatus === "CANCELLED").length;

  const planCounts = orgs.reduce<Record<string, number>>((acc, o) => {
    acc[o.plan] = (acc[o.plan] ?? 0) + 1;
    return acc;
  }, {});

  // ── Alerts ──────────────────────────────────────────────────────────────────
  const now = Date.now();
  const expiringOrgs = orgs.filter(
    (o) => o.billingStatus === "TRIALING" && o.trialEndsAt &&
      new Date(o.trialEndsAt).getTime() - now < 7 * 86_400_000 &&
      new Date(o.trialEndsAt).getTime() > now,
  );
  const pastDueOrgs = orgs.filter((o) => o.billingStatus === "PAST_DUE");

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">

      {/* ── Alerts ── */}
      {(expiringOrgs.length > 0 || pastDueOrgs.length > 0) && (
        <div className="space-y-2">
          {pastDueOrgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-red-500">●</span>
                <span className="font-semibold text-red-800 dark:text-red-300">{org.name}</span>
                <span className="text-red-600 dark:text-red-400">is past due</span>
              </div>
              <a href={`/platform/orgs/${org.id}`} className="rounded-lg border border-red-400/30 bg-red-500/5 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-500/15 dark:text-red-400">
                Fix →
              </a>
            </div>
          ))}
          {expiringOrgs.map((org) => {
            const days = Math.ceil((new Date(org.trialEndsAt!).getTime() - now) / 86_400_000);
            return (
              <div key={org.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">●</span>
                  <span className="font-semibold text-amber-800 dark:text-amber-300">{org.name}</span>
                  <span className="text-amber-700 dark:text-amber-400">trial expires in {days} day{days !== 1 ? "s" : ""}</span>
                </div>
                <a href={`/platform/orgs/${org.id}`} className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
                  Extend →
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Page header ── */}
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

      {/* ── KPI row ── */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: "Total",      value: orgs.length, color: "text-[var(--ink)]" },
          { label: "Paid",       value: activeOrgs,  color: "text-emerald-600" },
          { label: "Trialing",   value: trialOrgs,   color: "text-blue-600" },
          { label: "Past Due",   value: pastDue,     color: "text-red-600" },
          { label: "Cancelled",  value: cancelled,   color: "text-[var(--ink-muted)]" },
          { label: "Total Users",value: totalUsers,  color: "text-[var(--ink)]" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Revenue + plan breakdown ── */}
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

      {/* ── Org table (client component — search, filter, inline actions) ── */}
      <OrgTable orgs={orgs} />

      {/* ── Quick stats footer ── */}
      <p className="text-right text-[11px] text-[var(--ink-muted)]/60">
        {totalJobs.toLocaleString()} total jobs across all orgs
      </p>

    </div>
  );
}
