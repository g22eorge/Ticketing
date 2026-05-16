import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMoney, getAppCurrency } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { getJobPayoutsByIds, hasJobPayoutColumns } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

type SearchParams = {
  q?: string;
  paid?: string;
  month?: string;
};

const statusOptionLabel = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
} as const;

function parseMonth(monthParam?: string) {
  if (!monthParam) return null;
  const [yearRaw, monthRaw] = monthParam.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export default async function TechnicianPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user, orgId } = await requireOrgSession();
  if (user.role !== "TECHNICIAN_EXTERNAL") {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const month = parseMonth(filters.month);

  const jobs = await prisma.job.findMany({
    where: {
      orgId,
      assignedToId: session.user.id,
      repairPath: "EXTERNAL",
      ...(filters.q
        ? {
            OR: [
              { jobNumber: { contains: filters.q } },
              { brand: { contains: filters.q } },
              { model: { contains: filters.q } },
            ],
          }
        : {}),
      ...(filters.paid === "paid" ? { externalPaid: true } : {}),
      ...(filters.paid === "unpaid" ? { externalPaid: false } : {}),
      ...(month ? { completedAt: { gte: month.start, lte: month.end } } : {}),
    },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      brand: true,
      model: true,
      completedAt: true,
      receivedAt: true,
      externalTechBill: true,
    },
    orderBy: { receivedAt: "desc" },
  });

  const payoutColumnsReady = await hasJobPayoutColumns();
  const payouts = await getJobPayoutsByIds(jobs.map((job) => job.id));

  const currency = getAppCurrency();

  function resolveJobFee(job: typeof jobs[number]) {
    const fee = payouts.get(job.id)?.externalTechFee;
    if (typeof fee === "number" && fee > 0) return fee;
    if (typeof job.externalTechBill === "number" && job.externalTechBill > 0) return job.externalTechBill;
    return 0;
  }

  const total = jobs.reduce((sum, job) => sum + resolveJobFee(job), 0);
  const paid = jobs
    .filter((job) => payouts.get(job.id)?.externalPaid)
    .reduce((sum, job) => sum + resolveJobFee(job), 0);
  const unpaid = jobs
    .filter((job) => !payouts.get(job.id)?.externalPaid)
    .reduce((sum, job) => sum + resolveJobFee(job), 0);
  const hasPayoutFilters = Boolean(filters.q || filters.paid || filters.month);
  const payoutBrief = hasPayoutFilters
    ? "Filtered payout view is active. Use the amount cards below for live totals and reset filters to return to the complete payout queue."
    : "Use this payout board to reconcile external technician dues, confirm payment references, and clear outstanding balances.";
  const controlClass =
    "rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20";

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)] sm:text-[11px]">Payout Brief</p>
          <p className="mt-0.5 text-xs text-[var(--ink)] sm:text-sm">{payoutBrief}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Total</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(total, currency)}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">{formatMoney(unpaid, currency)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {!payoutColumnsReady ? (
            <p className="mt-1 text-xs text-[var(--accent)]">Payout columns are not migrated yet in this environment. Run latest Prisma migrations.</p>
          ) : null}
        </div>
        <Link href="/dashboard" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
          Back to dashboard
        </Link>
      </div>

      <form className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search job # / device"
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </form>

      <form className="panel-shadow hidden gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:grid lg:grid-cols-4">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search job # / device"
          className={controlClass}
        />
        <select
          name="paid"
          defaultValue={filters.paid}
          className={controlClass}
        >
          <option value="">All statuses</option>
          <option value="paid">Paid only</option>
          <option value="unpaid">Unpaid only</option>
        </select>
        <input
          type="month"
          name="month"
          defaultValue={filters.month}
          className={controlClass}
        />
        <div className="flex gap-2">
          <button className="btn-premium-secondary rounded-lg px-3 py-2">Apply</button>
          <Link href="/technicians/payouts" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
            Reset
          </Link>
        </div>
      </form>

      <div className="hidden gap-3 lg:grid lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-xs text-[var(--ink-muted)]">Total in view</p>
          <p className="text-2xl font-semibold">{formatMoney(total, currency)}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-xs text-[var(--ink-muted)]">Paid</p>
          <p className="text-2xl font-semibold text-[var(--accent)]">{formatMoney(paid, currency)}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-xs text-[var(--ink-muted)]">Outstanding</p>
          <p className="text-2xl font-semibold text-[var(--accent)]">{formatMoney(unpaid, currency)}</p>
        </div>
      </div>

      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No payout records found for these filters.</p>
        ) : (
          jobs.map((job) => {
            const payout = payouts.get(job.id);
            const isPaid = payout?.externalPaid ?? false;
            const fee = formatMoney(resolveJobFee(job), currency);
            const device = [job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") || "Device";
            return (
              <div key={job.id} className="relative border-b border-[var(--line)] bg-[var(--panel)] last:border-b-0 transition-colors hover:bg-[var(--panel-strong)]/40">
                <span className={`absolute inset-y-0 left-0 w-[5px] ${isPaid ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
                <Link href={`/jobs/${job.id}?returnTo=/technicians/payouts&returnLabel=Payouts`} className="absolute inset-0 z-0" aria-label={`Open ${job.jobNumber}`} />
                <div className="pointer-events-none relative z-10 px-4 py-3 pl-6">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="mono text-[10px] font-medium tracking-wide text-[var(--ink-muted)]/50">{job.jobNumber}</span>
                    <span className={`text-[11px] font-semibold ${isPaid ? "text-emerald-600" : "text-amber-600"}`}>
                      {isPaid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  <p className="text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">{device}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {(statusOptionLabel as Record<string, string>)[job.status] ?? job.status}
                      {job.completedAt ? ` · ${formatEATDate(job.completedAt)}` : ""}
                      {payout?.externalPaymentRef ? ` · Ref: ${payout.externalPaymentRef}` : ""}
                    </span>
                    <span className="text-[13px] font-bold text-[var(--ink)]">{fee}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
