import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { getBillingEventsByOrg } from "@/lib/billing-events";
import { setBillingStatusAction, setPlanAction, extendTrialAction } from "../../actions";

const STATUS_CLASSES: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  PAST_DUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getCurrentUserRole();
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL;
  if (!platformEmail || user!.email !== platformEmail) redirect("/dashboard");

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      billingStatus: true,
      isActive: true,
      trialEndsAt: true,
      planRenewsAt: true,
      planCancelledAt: true,
      flwSubscriptionId: true,
      flwCustomerId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true, jobs: true, clients: true } },
    },
  });

  if (!org) notFound();

  const [orgUsers, billingHistory] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    getBillingEventsByOrg(id),
  ]);

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const fmtMoney = (n: number, currency = "UGX") =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const totalPaid = billingHistory
    .filter((e) => e.status === "successful" && e.event === "charge.completed")
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/platform"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Organisations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">{org.name}</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">/{org.slug}</p>
        </div>
        <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[org.billingStatus] ?? "bg-gray-100 text-gray-600"}`}>
          {org.billingStatus}
        </span>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Users", value: org._count.users },
          { label: "Jobs", value: org._count.jobs },
          { label: "Clients", value: org._count.clients },
          { label: "Total Paid", value: fmtMoney(totalPaid) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">{m.label}</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Billing controls */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Billing Controls</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs text-[var(--ink-muted)]">
          <div>
            <p className="font-semibold text-[var(--ink-muted)]">Plan</p>
            <p className="font-mono text-[var(--ink)]">{org.plan}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--ink-muted)]">Trial ends</p>
            <p className="text-[var(--ink)]">{fmt(org.trialEndsAt)}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--ink-muted)]">Renews</p>
            <p className="text-[var(--ink)]">{fmt(org.planRenewsAt)}</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--ink-muted)]">FLW sub ID</p>
            <p className="font-mono text-[var(--ink)] truncate">{org.flwSubscriptionId ?? "—"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          {/* Set plan */}
          <form action={setPlanAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <select
              name="plan"
              defaultValue={org.plan}
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            >
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
            <button type="submit" className="rounded-md bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gold)]/30">
              Set plan
            </button>
          </form>

          {/* Set billing status */}
          <form action={setBillingStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <select
              name="status"
              defaultValue={org.billingStatus}
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            >
              <option value="TRIALING">Trialing</option>
              <option value="ACTIVE">Active</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <button type="submit" className="rounded-md bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-200">
              Set status
            </button>
          </form>

          {/* Extend trial */}
          <form action={extendTrialAction} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <select
              name="days"
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]"
            >
              <option value="7">+7 days</option>
              <option value="14">+14 days</option>
              <option value="30">+30 days</option>
            </select>
            <button type="submit" className="rounded-md bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-200">
              Extend trial
            </button>
          </form>
        </div>
      </div>

      {/* Users */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Users ({orgUsers.length})</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {orgUsers.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--gold)]/5">
                <td className="px-4 py-2 font-medium text-[var(--ink)]">{u.name}</td>
                <td className="px-4 py-2 text-[var(--ink-muted)]">{u.email}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-[var(--ink-muted)]">{fmt(u.createdAt)}</td>
              </tr>
            ))}
            {orgUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--ink-muted)]">No users.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Billing history */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payment History</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Event</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-left">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {billingHistory.map((e) => (
              <tr key={e.id} className="hover:bg-[var(--gold)]/5">
                <td className="px-4 py-2 text-[var(--ink-muted)]">{fmt(e.createdAt)}</td>
                <td className="px-4 py-2 text-[var(--ink)]">{e.event}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    e.status === "successful" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-[var(--ink)]">
                  {e.amount > 0 ? fmtMoney(e.amount, e.currency) : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--ink-muted)] truncate max-w-[140px]">
                  {e.txRef ?? e.flwTxId ?? "—"}
                </td>
              </tr>
            ))}
            {billingHistory.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--ink-muted)]">No payment records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
