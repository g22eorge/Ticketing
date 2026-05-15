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

  return (
    <section className="space-y-4">
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Job Cards · <span className="font-normal text-[var(--ink-muted)]">{jobs.length}</span>
        </p>
        <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Job</Link>
      </div>
      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Job</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Client</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Device</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Received</th>
              <th className="px-3 py-2.5">Action</th>
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
                  <a
                    href={`/api/jobs/${job.id}/job-card`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                  >
                    Generate
                  </a>
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
