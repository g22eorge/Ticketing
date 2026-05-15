import Link from "next/link";
import { redirect } from "next/navigation";

import { getClientBill } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";
import { canGenerateInvoiceForStatus, canGenerateQuotationForStatus, formatQuotationNumber } from "@/lib/documents";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { JobStatus } from "@prisma/client";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";

export default async function QuotationsPage() {
  const { user, orgId } = await requireOrgSession();
  if (!(["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(user.role) || can.viewFinancials(user))) {
    redirect("/dashboard");
  }

  const [jobs, branding] = await Promise.all([
    prisma.job.findMany({
      where: {
        orgId,
        status: {
          in: filterSupportedJobStatuses([
            "DIAGNOSING",
            "REFERRED",
            "IN_EXTERNAL_REPAIR",
            "WAITING_FOR_PARTS",
            "RETURNED_FROM_EXTERNAL",
            "AWAITING_APPROVAL",
            "IN_REPAIR",
            "READY_FOR_PICKUP",
            "COMPLETED",
            "CLOSED",
          ]) as JobStatus[],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        brand: true,
        model: true,
        clientBill: true,
        quotedAt: true,
        updatedAt: true,
        client: { select: { fullName: true } },
      },
    }),
    getDocumentBrandingSettings(orgId),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quoteReady = jobs.filter((j) => canGenerateQuotationForStatus(j.status)).length;
  const thisMonth = jobs.filter((j) => (j.quotedAt ?? j.updatedAt) >= monthStart).length;

  return (
    <section className="space-y-4">
      <div className="panel-shadow overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--accent)] text-xl font-black text-black">
              Q
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-black text-[var(--ink)]">Quotations</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">Track quote-ready jobs · issue PDFs · convert to invoice</p>
            </div>
          </div>
          <Link href="/jobs/new" className="btn-premium rounded-full px-4 py-2 text-sm">New Job</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Total Jobs</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{jobs.length}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Quote Ready</p>
          <p className="mt-2 text-2xl font-bold text-[var(--accent)]">{quoteReady}</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">This Month</p>
          <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{thisMonth}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Job</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Client</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Device</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Quote #</th>
              <th className="hidden px-3 py-2.5 xl:table-cell">Estimate</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const issuedAt = job.quotedAt ?? job.updatedAt;
              const quoteNumber = formatQuotationNumber(
                job.jobNumber,
                issuedAt,
                branding.quotePrefix,
                branding.quoteFormat,
                branding.sequencePadLength,
              );
              const estimate = getClientBill(job);
              return (
                <tr key={job.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-3 py-2.5">
                    <Link className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${job.id}`}>
                      {job.jobNumber}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] md:table-cell">{job.client.fullName}</td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{job.brand} {job.model}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <JobStatusBadge status={job.status} />
                      {canGenerateInvoiceForStatus(job.status) && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Invoice Ready</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] lg:table-cell">{canGenerateQuotationForStatus(job.status) ? quoteNumber : "-"}</td>
                  <td className="hidden px-3 py-2.5 text-[var(--ink-muted)] xl:table-cell">{typeof estimate === "number" ? formatMoney(estimate) : "Pending"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/jobs/${job.id}`} className="inline-flex items-center rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)]">
                        View
                      </Link>
                      {canGenerateQuotationForStatus(job.status) ? (
                        <a href={`/api/jobs/${job.id}/quotation`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          Quote
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-muted)] opacity-40">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                          Quote
                        </span>
                      )}
                      {canGenerateInvoiceForStatus(job.status) && (
                        <a href={`/api/jobs/${job.id}/invoice`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                          Invoice
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-8 text-sm text-[var(--ink-muted)]" colSpan={7}>
                  No quote-ready jobs yet. Move a job into diagnosis to unlock quotation generation.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
