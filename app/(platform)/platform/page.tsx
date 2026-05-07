import { prisma } from "@/lib/prisma";
import { setPlanAction, toggleOrgActive } from "./actions";

const STATUS_CLASSES: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PAST_DUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-[var(--line)] text-[var(--ink-muted)]",
};

const PLAN_CLASSES: Record<string, string> = {
  STARTER: "bg-[var(--line)] text-[var(--ink-muted)]",
  GROWTH: "bg-[var(--gold)]/20 text-[var(--gold)]",
  ENTERPRISE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default async function PlatformPage() {
  const orgs = await prisma.organization.findMany({
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
  });

  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Organisations</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {orgs.length} organisation{orgs.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-3">Org</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-4 py-3 text-right">Jobs</th>
              <th className="px-4 py-3">Trial / Renews</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Set plan</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {orgs.map((org) => (
              <tr key={org.id} className={`transition-colors hover:bg-[var(--gold)]/5 ${!org.isActive ? "opacity-50" : ""}`}>
                {/* Org name + slug */}
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--ink)]">{org.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">{org.slug}</p>
                </td>

                {/* Plan badge */}
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PLAN_CLASSES[org.plan] ?? ""}`}>
                    {org.plan}
                  </span>
                </td>

                {/* Billing status badge */}
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[org.billingStatus] ?? ""}`}>
                    {org.billingStatus}
                  </span>
                </td>

                {/* Counts */}
                <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{org._count.users}</td>
                <td className="px-4 py-3 text-right text-[var(--ink-muted)]">{org._count.jobs}</td>

                {/* Trial / renews */}
                <td className="px-4 py-3 text-[var(--ink-muted)]">
                  {org.billingStatus === "TRIALING" ? fmt(org.trialEndsAt) : fmt(org.planRenewsAt)}
                </td>

                {/* Created */}
                <td className="px-4 py-3 text-[var(--ink-muted)]">{fmt(org.createdAt)}</td>

                {/* Set plan form */}
                <td className="px-4 py-3">
                  <form action={setPlanAction} className="flex items-center gap-2">
                    <input type="hidden" name="orgId" value={org.id} />
                    <select
                      name="plan"
                      defaultValue={org.plan}
                      className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
                    >
                      <option value="STARTER">Starter</option>
                      <option value="GROWTH">Growth</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--gold)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30 transition-colors"
                    >
                      Set
                    </button>
                  </form>
                </td>

                {/* Toggle active */}
                <td className="px-4 py-3">
                  <form action={toggleOrgActive}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="isActive" value={String(org.isActive)} />
                    <button
                      type="submit"
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                        org.isActive
                          ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                          : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                      }`}
                    >
                      {org.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}

            {orgs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                  No organisations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
