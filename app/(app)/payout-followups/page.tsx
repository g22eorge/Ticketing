import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, JobStatus } from "@prisma/client";

import { formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

type SearchParams = {
  q?: string;
  tech?: string;
  page?: string;
};

const PAGE_SIZE = 25;
const TERMINAL = ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] as JobStatus[];

function buildSearch(q?: string): Prisma.JobWhereInput {
  if (!q) return {};
  return {
    OR: [
      { jobNumber: { contains: q } },
      { client: { fullName: { contains: q } } },
      { assignedTo: { is: { name: { contains: q } } } },
    ],
  };
}

export default async function PayoutFollowupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await getCurrentUserRole();
  if (!(can.approveInvoices(user) || can.reviewExternalBills(user))) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const page = Math.max(Number(filters.page ?? "1") || 1, 1);
  const currency = getAppCurrency();
  const search = buildSearch(filters.q);
  const techFilter = filters.tech ? { assignedToId: filters.tech } : {};

  // ── Section 1: outstanding client payments (any repair path) ──────────────
  const clientWhere: Prisma.JobWhereInput = {
    clientBill: { gt: 0 },
    clientPaid: false,
    status: { in: TERMINAL },
    ...search,
    ...techFilter,
  };

  // ── Section 2: external tech payouts not yet settled ──────────────────────
  const techWhere: Prisma.JobWhereInput = {
    repairPath: "EXTERNAL",
    externalPaid: false,
    status: { in: TERMINAL },
    ...search,
    ...techFilter,
  };

  const [clientRows, clientTotal, techRows, techTotal, technicians] = await Promise.all([
    prisma.job.findMany({
      where: clientWhere,
      orderBy: [{ deliveredAt: "desc" }, { completedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        repairPath: true,
        clientBill: true,
        completedAt: true,
        deliveredAt: true,
        client: { select: { fullName: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    prisma.job.count({ where: clientWhere }),
    prisma.job.findMany({
      where: techWhere,
      orderBy: [{ deliveredAt: "desc" }, { completedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        clientBill: true,
        externalTechFee: true,
        externalTechBill: true,
        completedAt: true,
        deliveredAt: true,
        client: { select: { fullName: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    prisma.job.count({ where: techWhere }),
    prisma.user.findMany({
      where: { role: { in: ["TECHNICIAN_EXTERNAL", "TECHNICIAN_INTERNAL"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const clientPages = Math.max(Math.ceil(clientTotal / PAGE_SIZE), 1);
  const techPages = Math.max(Math.ceil(techTotal / PAGE_SIZE), 1);
  const totalPages = Math.max(clientPages, techPages);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([key, v]) => key !== "page" && typeof v === "string" && v.length > 0),
  ) as Record<string, string>;

  const clientOutstanding = clientRows.reduce((s, j) => s + (j.clientBill ?? 0), 0);
  const techOwed = techRows.reduce((s, j) => s + (j.externalTechFee ?? j.externalTechBill ?? 0), 0);

  const thClass = "px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]";
  const tdClass = "px-4 py-2.5";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Finance</p>
            <p className="text-base font-semibold text-[var(--ink)]">Payment Follow-up Board</p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Client collections and external tech payouts — completed jobs only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              {clientTotal} client{clientTotal !== 1 ? "s" : ""} owe · {formatMoneyCompact(clientOutstanding, currency)}
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
              {techTotal} tech payout{techTotal !== 1 ? "s" : ""} pending · {formatMoneyCompact(techOwed, currency)}
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search job #, client, technician"
            className="min-w-[220px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/40"
          />
          <select name="tech" defaultValue={filters.tech} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm">
            <option value="">All technicians</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
          <button className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Apply</button>
          <Link href="/payout-followups" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">Reset</Link>
        </form>
      </section>

      {/* ── Section 1: Client collections ──────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
          <p className="text-sm font-semibold text-[var(--ink)]">Client Payments — Outstanding</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">{clientTotal}</span>
        </div>
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          {clientRows.length === 0 ? (
            <p className="p-4 text-sm text-[var(--ink-muted)]">
              {filters.q || filters.tech ? "No results for these filters." : "All client payments are settled — nothing outstanding."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-[var(--panel-strong)]/50">
                  <tr>
                    <th className={thClass}>Job</th>
                    <th className={thClass}>Client</th>
                    <th className={thClass}>Assigned To</th>
                    <th className={thClass}>Type</th>
                    <th className={thClass}>Amount Due</th>
                    <th className={thClass}>Completed</th>
                    <th className={thClass}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((job) => {
                    const doneAt = job.deliveredAt ?? job.completedAt;
                    return (
                      <tr key={job.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                        <td className={`${tdClass} font-semibold`}>
                          <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="hover:text-[var(--accent)] transition-colors">
                            {job.jobNumber}
                          </Link>
                        </td>
                        <td className={tdClass}>
                          <p className="font-medium">{job.client?.fullName ?? "—"}</p>
                          <p className="text-xs text-[var(--ink-muted)]">{job.client?.phone ?? "—"}</p>
                        </td>
                        <td className={tdClass}>{job.assignedTo?.name ?? "Unassigned"}</td>
                        <td className={tdClass}>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${job.repairPath === "EXTERNAL" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>
                            {job.repairPath === "EXTERNAL" ? "External" : "In-house"}
                          </span>
                        </td>
                        <td className={`${tdClass} font-semibold text-amber-700 dark:text-amber-400`}>
                          {formatMoneyCompact(job.clientBill ?? 0, currency)}
                        </td>
                        <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                          {doneAt ? new Date(doneAt).toLocaleDateString() : "—"}
                        </td>
                        <td className={tdClass}>
                          <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 2: External tech payouts ───────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
          <p className="text-sm font-semibold text-[var(--ink)]">External Tech Payouts — Pending</p>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">{techTotal}</span>
        </div>
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          {techRows.length === 0 ? (
            <p className="p-4 text-sm text-[var(--ink-muted)]">
              {filters.q || filters.tech ? "No results for these filters." : "No pending external tech payouts — all settled."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-[var(--panel-strong)]/50">
                  <tr>
                    <th className={thClass}>Job</th>
                    <th className={thClass}>Client</th>
                    <th className={thClass}>Technician</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Client Bill</th>
                    <th className={thClass}>Payout Due</th>
                    <th className={thClass}>Done At</th>
                    <th className={thClass}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {techRows.map((job) => {
                    const payoutDue = job.externalTechFee ?? job.externalTechBill ?? 0;
                    const doneAt = job.deliveredAt ?? job.completedAt;
                    return (
                      <tr key={job.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                        <td className={`${tdClass} font-semibold`}>
                          <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="hover:text-[var(--accent)] transition-colors">
                            {job.jobNumber}
                          </Link>
                        </td>
                        <td className={tdClass}>
                          <p className="font-medium">{job.client?.fullName ?? "—"}</p>
                          <p className="text-xs text-[var(--ink-muted)]">{job.client?.phone ?? "—"}</p>
                        </td>
                        <td className={tdClass}>{job.assignedTo?.name ?? "Unassigned"}</td>
                        <td className={tdClass}>{job.status}</td>
                        <td className={tdClass}>
                          {typeof job.clientBill === "number" ? formatMoneyCompact(job.clientBill, currency) : "—"}
                        </td>
                        <td className={`${tdClass} font-semibold text-blue-700 dark:text-blue-400`}>
                          {formatMoneyCompact(payoutDue, currency)}
                        </td>
                        <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                          {doneAt ? new Date(doneAt).toLocaleDateString() : "—"}
                        </td>
                        <td className={tdClass}>
                          <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`?${new URLSearchParams({ ...preserved, page: String(prevPage) }).toString()}`}
            aria-disabled={page <= 1}
            className={`btn-premium-secondary rounded-lg px-3 py-1.5 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            Prev
          </Link>
          <span className="text-xs text-[var(--ink-muted)]">Page {page} / {totalPages}</span>
          <Link
            href={`?${new URLSearchParams({ ...preserved, page: String(nextPage) }).toString()}`}
            aria-disabled={page >= totalPages}
            className={`btn-premium-secondary rounded-lg px-3 py-1.5 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}
