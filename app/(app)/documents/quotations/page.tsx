import Link from "next/link";
import { redirect } from "next/navigation";

import { getClientBill } from "@/lib/billing";
import { formatMoney } from "@/lib/currency";
import { canGenerateQuotationForStatus, formatQuotationNumber } from "@/lib/documents";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { JobStatus } from "@prisma/client";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

export default async function QuotationsPage() {
  const { user } = await getCurrentUserRole();
  if (!(["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(user.role) || can.viewFinancials(user))) {
    redirect("/dashboard");
  }

  const [jobs, branding] = await Promise.all([
    prisma.job.findMany({
      where: {
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
    getDocumentBrandingSettings(),
  ]);

  return (
    <section className="space-y-4">
      <div className="panel-shadow flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[var(--ink)]">
          Quotations · <span className="font-normal text-[var(--ink-muted)]">{jobs.length}</span>
        </p>
        <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">New Job</Link>
      </div>
      <div className="rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Job</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Device</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Quote #</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Estimate</th>
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
                <tr key={job.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">
                    <Link className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]" href={`/jobs/${job.id}`}>
                      {job.jobNumber}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] md:table-cell">{job.brand} {job.model}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{job.status.replaceAll("_", " ")}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{canGenerateQuotationForStatus(job.status) ? quoteNumber : "-"}</td>
                  <td className="hidden px-3 py-2 text-[var(--ink-muted)] lg:table-cell">{typeof estimate === "number" ? formatMoney(estimate) : "Pending"}</td>
                  <td className="px-3 py-2">
                    {canGenerateQuotationForStatus(job.status) ? (
                      <a
                        href={`/api/jobs/${job.id}/quotation`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-premium-secondary inline-flex rounded-md px-2.5 py-1.5 text-xs"
                      >
                        Generate
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">Await diagnosis</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr className="border-t border-[var(--line)]">
                <td className="px-3 py-6 text-sm text-[var(--ink-muted)]" colSpan={6}>
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
