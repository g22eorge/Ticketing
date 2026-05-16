import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTotalRevenue, getMonthlyRevenue } from "@/lib/billing-events";
import { runCommercialSeedAction } from "./actions";

const STATUS_CLASSES: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAST_DUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-[var(--line)] text-[var(--ink-muted)]",
};

const PLAN_CLASSES: Record<string, string> = {
  STARTER: "bg-[var(--line)] text-[var(--ink-muted)]",
  GROWTH: "bg-amber-100 text-amber-700",
  ENTERPRISE: "bg-purple-100 text-purple-700",
};

export default async function PlatformPage() {
  const [orgs, totalRevenue, monthRevenue] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        billingStatus: true,
        trialEndsAt: true,
        planRenewsAt: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, jobs: true } },
      },
    }),
    getTotalRevenue(),
    getMonthlyRevenue(),
  ]);

  const totalJobs = orgs.reduce((s, o) => s + o._count.jobs, 0);
  const activeOrgs = orgs.filter((o) => o.billingStatus === "ACTIVE").length;
  const trialingOrgs = orgs.filter((o) => o.billingStatus === "TRIALING").length;
  const starterCount = orgs.filter((o) => o.plan === "STARTER").length;
  const growthCount = orgs.filter((o) => o.plan === "GROWTH").length;
  const enterpriseCount = orgs.filter((o) => o.plan === "ENTERPRISE").length;

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Organisations</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {orgs.length} organisation{orgs.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        {orgs.length === 0 && (
          <form action={runCommercialSeedAction}>
            <button
              type="submit"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors"
            >
              + Seed Demo Data
            </button>
          </form>
        )}
      </div>

      {/* Row 1 — activity counts */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Orgs", value: orgs.length, color: "text-[var(--ink)]" },
          { label: "Active Paid", value: activeOrgs, color: "text-emerald-600" },
          { label: "On Trial", value: trialingOrgs, color: "text-blue-600" },
          { label: "Total Jobs", value: totalJobs, color: "text-[var(--ink)]" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className={`mt-1 text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Row 2 — plan breakdown + revenue */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Starter</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{starterCount}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-600">Growth</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{growthCount}</p>
        </div>
        <div className="rounded-xl border border-purple-100 bg-purple-50 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-purple-600">Enterprise</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">{enterpriseCount}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{fmtMoney(monthRevenue)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">All-Time Revenue</p>
          <p className="mt-1 text-xl font-bold text-[var(--ink)]">{fmtMoney(totalRevenue)}</p>
        </div>
      </div>

      {/* Org table */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">All Organisations</p>
          {orgs.length > 0 && (
            <form action={runCommercialSeedAction}>
              <button
                type="submit"
                className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--line)] transition-colors"
              >
                + Seed Demo Data
              </button>
            </form>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Users</th>
              <th className="px-4 py-3 text-center">Jobs</th>
              <th className="px-4 py-3">Trial / Renews</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {orgs.map((org) => (
              <tr
                key={org.id}
                className={`transition-colors hover:bg-[var(--gold)]/5 ${!org.isActive ? "opacity-40" : ""}`}
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--ink)]">{org.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">/{org.slug}</p>
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PLAN_CLASSES[org.plan] ?? ""}`}>
                    {org.plan}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[org.billingStatus] ?? ""}`}>
                    {org.billingStatus}
                  </span>
                </td>

                <td className="px-4 py-3 text-center font-mono text-[var(--ink-muted)]">
                  {org._count.users}
                </td>

                <td className="px-4 py-3 text-center font-mono text-[var(--ink-muted)]">
                  {org._count.jobs}
                </td>

                <td className="px-4 py-3 text-sm text-[var(--ink-muted)]">
                  {org.billingStatus === "TRIALING" ? fmt(org.trialEndsAt) : fmt(org.planRenewsAt)}
                </td>

                <td className="px-4 py-3 text-sm text-[var(--ink-muted)]">
                  {fmt(org.createdAt)}
                </td>

                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/platform/orgs/${org.id}`}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}

            {orgs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--ink-muted)]">
                  No organisations yet. Click <strong>+ Seed Demo Data</strong> to add 3 demo orgs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
