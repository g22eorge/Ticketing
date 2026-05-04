import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export default async function JobCardsPage() {
  const { user } = await getCurrentUserRole();
  if (!can.generateJobCards(user)) {
    redirect("/dashboard");
  }

  const jobs = await prisma.job.findMany({
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
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Job Cards</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Intake records for received and active jobs. Generate printable PDFs directly from this queue.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
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
                <td className="px-3 py-2 font-medium text-[var(--ink)]">
                  <Link className="hover:underline" href={`/jobs/${job.id}`}>
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
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/jobs" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">Open Jobs</Link>
      </div>
    </section>
  );
}
