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
  const pageSize = 25;
  const currency = getAppCurrency();

  const where: Prisma.JobWhereInput = {
    repairPath: "EXTERNAL" as const,
    clientBill: { not: null },
    externalPaid: false,
    status: { in: ["DELIVERED", "COMPLETED"] as JobStatus[] },
    ...(filters.q
      ? {
          OR: [
            { jobNumber: { contains: filters.q } },
            { client: { fullName: { contains: filters.q } } },
            { assignedTo: { is: { name: { contains: filters.q } } } },
          ],
        }
      : {}),
    ...(filters.tech ? { assignedToId: filters.tech } : {}),
  };

  const [rows, total, technicians] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [
        { deliveredAt: "desc" },
        { completedAt: "desc" },
        { updatedAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    prisma.job.count({ where }),
    prisma.user.findMany({
      where: { role: { in: ["TECHNICIAN_EXTERNAL", "TECHNICIAN_INTERNAL"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => key !== "page" && typeof value === "string" && value.length > 0),
  ) as Record<string, string>;

  const payoutTotal = rows.reduce((sum, job) => {
    const amount = typeof job.externalTechFee === "number"
      ? job.externalTechFee
      : typeof job.externalTechBill === "number"
        ? job.externalTechBill
        : 0;
    return sum + amount;
  }, 0);

  return (
    <div className="space-y-4">
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Finance Follow-up</p>
            <p className="text-base font-semibold text-[var(--ink)]">Collected, Not Yet Paid Out</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            {rows.length} listed · {formatMoneyCompact(payoutTotal, currency)} due
          </div>
        </div>
      </section>

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

      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-[var(--ink-muted)]">No payout follow-ups match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Job</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Technician</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Client Bill</th>
                  <th className="px-4 py-2.5">Payout Due</th>
                  <th className="px-4 py-2.5">Done At</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => {
                  const payoutDue = typeof job.externalTechFee === "number"
                    ? job.externalTechFee
                    : typeof job.externalTechBill === "number"
                      ? job.externalTechBill
                      : 0;
                  const doneAt = job.deliveredAt ?? job.completedAt;
                  return (
                    <tr key={job.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-2.5 font-semibold">
                        <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="hover:text-[var(--accent)] transition-colors">{job.jobNumber}</Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{job.client?.fullName ?? "-"}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{job.client?.phone ?? "-"}</p>
                      </td>
                      <td className="px-4 py-2.5">{job.assignedTo?.name ?? "Unassigned"}</td>
                      <td className="px-4 py-2.5">{job.status}</td>
                      <td className="px-4 py-2.5">{typeof job.clientBill === "number" ? formatMoneyCompact(job.clientBill, currency) : "-"}</td>
                      <td className="px-4 py-2.5 font-semibold text-amber-700">{formatMoneyCompact(payoutDue, currency)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)]">{doneAt ? new Date(doneAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Payment+follow-up`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
