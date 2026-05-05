import Link from "next/link";
import { redirect } from "next/navigation";

import { getClientBill } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";
import { canGenerateInvoiceForStatus } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export default async function InvoicesPage() {
  const { user } = await getCurrentUserRole();
  if (!(["ADMIN", "OPS"].includes(user.role) || can.approveInvoices(user))) {
    redirect("/dashboard");
  }

  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { status: { in: ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"] } },
        { invoiceIssuedAt: { not: null } },
        { invoiceNumber: { not: null } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      jobNumber: true,
      invoiceNumber: true,
      invoiceIssuedAt: true,
      clientPaid: true,
      status: true,
      clientBill: true,
      updatedAt: true,
      client: { select: { fullName: true } },
    },
  });

  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-1 text-lg font-semibold text-[var(--ink)]">Invoices</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        Track issued invoices, payment state, and generate final invoice PDFs.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Job</th>
              <th className="hidden px-3 py-2 md:table-cell">Invoice #</th>
              <th className="px-3 py-2">Status</th>
              <th className="hidden px-3 py-2 lg:table-cell">Amount</th>
              <th className="hidden px-3 py-2 lg:table-cell">Paid</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const amount = getClientBill(job);
              return (
                <tr key={job.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">
                    <Link className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${job.id}`}>
                      {job.jobNumber}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] md:table-cell">{job.invoiceNumber ?? "-"}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{job.status.replaceAll("_", " ")}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{typeof amount === "number" ? formatMoney(amount) : "Pending"}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{job.clientPaid ? "Paid" : "Unpaid"}</td>
                  <td className="px-3 py-2">
                    {canGenerateInvoiceForStatus(job.status) ? (
                      <a
                        href={`/api/jobs/${job.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                      >
                        Generate
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">Not ready</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
                  No invoice-ready jobs yet. Set job status to Ready for Pickup or Completed.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/jobs" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
          Open Jobs
        </Link>
        <Link href="/payout-followups" className="btn-premium-secondary rounded-lg px-3 py-2 text-sm">
          Payment Follow-up
        </Link>
      </div>
    </section>
  );
}
