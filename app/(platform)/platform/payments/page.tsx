import Link from "next/link";
import { getRecentBillingEvents, getTotalRevenue, getMonthlyRevenue } from "@/lib/billing-events";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { planLabel } from "@/lib/plan-labels";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requirePlatformAdmin();

  const [events, totalRevenue, monthRevenue] = await Promise.all([
    getRecentBillingEvents(100),
    getTotalRevenue(),
    getMonthlyRevenue(),
  ]);

  const successfulCount = events.filter(
    (e) => e.status === "successful" && e.event === "charge.completed",
  ).length;

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });

  const fmtMoney = (n: number, currency = "UGX") =>
    new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ink)]">Payments</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Payment events recorded from Pesapal webhooks</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Revenue This Month</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{fmtMoney(monthRevenue)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{fmtMoney(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Successful Transactions</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{successfulCount}</p>
        </div>
      </div>

      {/* Event log */}
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-[var(--gold)]/5">
                <td className="px-4 py-2 text-[var(--ink-muted)] whitespace-nowrap">{fmt(e.createdAt)}</td>
                <td className="px-4 py-2">
                  <Link href={`/platform/orgs/${e.orgId}`} className="font-medium text-[var(--ink)] hover:underline">
                    {e.orgName ?? e.orgId}
                  </Link>
                </td>
                <td className="px-4 py-2 text-[var(--ink)]">{e.event}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      e.status === "successful"
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : e.status === "cancelled"
                        ? "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                        : "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {e.amount > 0 ? fmtMoney(e.amount, e.currency) : "—"}
                </td>
                <td className="px-4 py-2 text-[var(--ink-muted)]">{e.plan ? planLabel(e.plan) : "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--ink-muted)] max-w-[160px] truncate">
                  {e.txRef ?? "—"}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                  No payment events recorded yet. Events are logged when Pesapal IPN callbacks fire.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
