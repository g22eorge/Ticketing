import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

export default async function JobCardsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!can.generateJobCards(user)) {
    redirect("/dashboard");
  }

  const jobs = await prisma.job.findMany({
    where: { orgId },
    orderBy: { receivedAt: "desc" },
    take: 80,
    select: {
      id: true,
      jobNumber: true,
      status: true,
      brand: true,
      model: true,
      receivedAt: true,
      client: { select: { fullName: true } },
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = jobs.filter((j) => j.receivedAt >= monthStart).length;
  const openCount = jobs.filter((j) => !["COMPLETED", "CLOSED"].includes(j.status)).length;

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-gradient-to-r from-sky-100 via-white to-orange-100 p-4 text-slate-950 sm:p-6 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-[var(--ink)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Job Cards</h1>
            <p className="mt-1 text-sm text-slate-700 dark:text-[var(--ink-muted)]">Intake records for received and active jobs.</p>
          </div>
          <Link href="/jobs/new" className="btn-premium rounded-full px-4 py-2 text-sm text-white">New Job</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{jobs.length}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{thisMonth}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Open</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{openCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Job</th>
              <th className="hidden px-3 py-2 md:table-cell">Client</th>
              <th className="hidden px-3 py-2 lg:table-cell">Device</th>
              <th className="px-3 py-2">Status</th>
              <th className="hidden px-3 py-2 lg:table-cell">Received</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2">
                  <Link className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${job.id}`}>
                    {job.jobNumber}
                  </Link>
                </td>
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] md:table-cell">{job.client.fullName}</td>
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{job.brand} {job.model}</td>
                <td className="px-3 py-2 text-[var(--ink-muted)]">{job.status.replaceAll("_", " ")}</td>
                <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{job.receivedAt.toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <details className="relative inline-block">
                    <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] transition hover:border-[var(--accent)]/40">
                      <span className="sr-only">Actions</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="19" cy="12" r="1.8" />
                      </svg>
                    </summary>
                    <div className="panel-shadow absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
                      <div className="py-1">
                        <Link href={`/jobs/${job.id}`} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                          View
                        </Link>
                        <a href={`/api/jobs/${job.id}/job-card`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          Download PDF
                        </a>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No jobs yet. Create a job first to generate its job card.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
