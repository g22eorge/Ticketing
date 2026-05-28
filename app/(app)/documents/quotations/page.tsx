import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { CopyButton } from "@/components/shared/CopyButton";
import { getClientBill } from "@/lib/billing";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { canGenerateQuotationForStatus, formatQuotationNumber } from "@/lib/documents";
import { getDocumentBrandingSettings } from "@/lib/document-branding";
import { normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { JobStatus } from "@prisma/client";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ensureInvoiceFromQuotation, ensureQuotationFromJob } from "@/lib/commercial/document-workflow";

type SearchParams = { q?: string; approval?: string };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!((["ADMIN", "OPS", "MANAGER", "SALES", "TECHNICIAN_INTERNAL"].includes(user.role) || can.viewFinancials(user)))) {
    redirect("/dashboard");
  }
  await requireModule(OrgModule.INVOICING);

  const { q, approval: approvalFilter } = await searchParams;
  const currency = getAppCurrency();

  // ── Server action: mark quotation as sent (sets quotedAt = now) ──────────
  async function markSent(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(["ADMIN", "OPS", "MANAGER", "SALES", "FINANCE"].includes(user.role) || can.viewFinancials(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const jobId = formData.get("jobId") as string;
    if (!jobId) return;
    await prisma.job.update({
      where: { id: jobId, orgId },
      data: { quotedAt: new Date() },
    });
    revalidatePath("/documents/quotations");
  }

  async function convertQuotationToInvoiceAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(["ADMIN", "OPS", "MANAGER", "FINANCE"].includes(user.role) || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const jobId = String(formData.get("jobId") ?? "").trim();
    const quotationId = String(formData.get("quotationId") ?? "").trim();
    if (!jobId && !quotationId) return;

    const result = await prisma.$transaction(async (tx) => {
      const quotation = quotationId
        ? await tx.quotation.findFirst({ where: { id: quotationId, orgId }, include: { items: true } })
        : await ensureQuotationFromJob(tx, { orgId, jobId, userId: user.id, currency: org.baseCurrency });
      if (!quotation) return;
      const invoice = await ensureInvoiceFromQuotation(tx, { orgId, quotationId: quotation.id, currency: org.baseCurrency });
      return invoice ? { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, quoteNumber: quotation.quoteNumber } : null;
    });
    if (result) {
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Invoice", entityId: result.invoiceId, action: "QUOTATION_CONVERTED_TO_INVOICE", summary: `${result.quoteNumber} converted to ${result.invoiceNumber}` });
    }

    revalidatePath("/documents/quotations");
    revalidatePath("/documents/invoices");
  }

  const [jobs, branding] = await Promise.all([
    prisma.job.findMany({
      where: {
        orgId,
        status: approvalFilter === "pending"
          ? ("AWAITING_APPROVAL" as JobStatus)
          : {
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
        ...(approvalFilter === "pending"
          ? { clientApproved: null }
          : approvalFilter === "approved"
          ? { clientApproved: true }
          : approvalFilter === "declined"
          ? { clientApproved: false }
          : {}),
        ...(q
          ? {
              OR: [
                { jobNumber: { contains: q } },
                { client: { fullName: { contains: q } } },
                { brand: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [
        // AWAITING_APPROVAL jobs float to top
        { status: "asc" },
        { updatedAt: "desc" },
      ],
      take: 100,
      select: {
        id: true,
        jobNumber: true,
        status: true,
        brand: true,
        model: true,
        deviceType: true,
        clientBill: true,
        quotedAt: true,
        updatedAt: true,
        clientApproved: true,
        approvalDate: true,
        client: { select: { fullName: true, phone: true } },
        quotations: { select: { id: true, quoteNumber: true, convertedToInvoiceId: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    getDocumentBrandingSettings(),
  ]);

  // Sort: AWAITING_APPROVAL first, then by updatedAt desc
  const sorted = [...jobs].sort((a, b) => {
    const aAw = a.status === "AWAITING_APPROVAL" ? 0 : 1;
    const bAw = b.status === "AWAITING_APPROVAL" ? 0 : 1;
    if (aAw !== bAw) return aAw - bAw;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const pendingCount = jobs.filter(
    (j) => j.status === "AWAITING_APPROVAL" && j.clientApproved === null,
  ).length;
  const nowMs = Date.now();

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">
              Quotations{" "}
              <span className="font-normal text-[var(--ink-muted)]">
                · {jobs.length}
              </span>
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              {pendingCount} awaiting client
            </span>
          )}
        </div>
        <Link href="/documents/quotations" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
          Create Quotation
        </Link>
      </div>

      {/* Search + filter */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search job #, client, device…"
          className="flex-1 min-w-[180px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none focus:border-[var(--accent)]/50"
        />
        <select
          name="approval"
          defaultValue={approvalFilter ?? ""}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
        >
          <option value="">All quotes</option>
          <option value="pending">Awaiting approval</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/40"
        >
          Filter
        </button>
        {(q || approvalFilter) && (
          <Link
            href="/documents/quotations"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Job</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Client</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Device</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Estimate</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Sent</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]"
                >
                  {q || approvalFilter
                    ? "No quotes match your filter."
                    : "No quote-ready jobs yet. Diagnose a job to unlock quotation."}
                </td>
              </tr>
            ) : (
              sorted.map((job) => {
                const issuedAt = job.quotedAt ?? job.updatedAt;
                const quoteNumber = formatQuotationNumber(
                  job.jobNumber,
                  issuedAt,
                  branding.quotePrefix,
                  branding.quoteFormat,
                  branding.sequencePadLength,
                );
                const canGenerate = canGenerateQuotationForStatus(job.status);
                const persistedQuotation = job.quotations[0] ?? null;
                const estimate = getClientBill(job);
                const pdfUrl = `${appUrl}/api/jobs/${job.id}/quotation`;
                const pdfHref = `/api/jobs/${job.id}/quotation`;
                const clientPhone = (job.client.phone ?? "").replace(/\D/g, "");
                const waPhone = clientPhone.startsWith("0")
                  ? "256" + clientPhone.slice(1)
                  : clientPhone;

                const approvalBadge =
                  job.clientApproved === true ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                      Approved
                    </span>
                  ) : job.clientApproved === false ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                      Declined
                    </span>
                  ) : job.status === "AWAITING_APPROVAL" ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 animate-pulse">
                      Awaiting
                    </span>
                  ) : null;

                const daysPending =
                  job.status === "AWAITING_APPROVAL"
                    ? Math.floor(
                        (nowMs - job.updatedAt.getTime()) / 86400000,
                      )
                    : null;

                const waQuoteText = encodeURIComponent(
                  `Hi ${job.client.fullName}, your repair quote is ready.\n\nQuote #: ${quoteNumber}\nDevice: ${job.brand} ${job.model}\nEstimate: ${typeof estimate === "number" ? formatMoney(estimate, currency) : "TBD"}\n\nReply YES to approve and we'll begin the repair immediately.`,
                );

                const normalStatus = normalizeJobStatus(job.status as never);

                return (
                  <tr
                    key={job.id}
                    className={`border-t border-[var(--line)] transition hover:bg-[var(--panel-strong)]/40 ${job.status === "AWAITING_APPROVAL" ? "bg-amber-500/[0.03]" : ""}`}
                  >
                    {/* Job # */}
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="mono text-xs font-bold text-[var(--accent)] hover:underline"
                      >
                        {job.jobNumber}
                      </Link>
                      {canGenerate && (
                        <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                          {quoteNumber}
                        </p>
                      )}
                      {/* Mobile: show client + approval inline */}
                      <p className="mt-0.5 text-[10px] text-[var(--ink-muted)] sm:hidden">
                        {job.client.fullName}
                      </p>
                      <div className="mt-1 sm:hidden">{approvalBadge}</div>
                    </td>

                    {/* Client */}
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <p className="text-xs font-medium text-[var(--ink)]">
                        {job.client.fullName}
                      </p>
                      <p className="text-[10px] text-[var(--ink-muted)]">
                        {job.client.phone}
                      </p>
                    </td>

                    {/* Device */}
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <p className="text-xs text-[var(--ink)]">
                        {job.brand} {job.model}
                      </p>
                    </td>

                    {/* Status + approval badge */}
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <JobStatusBadge status={normalStatus} />
                        {approvalBadge}
                        {daysPending !== null && daysPending > 0 && (
                          <span
                            className={`text-[10px] font-medium ${daysPending >= 3 ? "text-red-400" : "text-amber-600"}`}
                          >
                            {daysPending}d pending
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Estimate */}
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {typeof estimate === "number" ? (
                        <span className="text-xs font-semibold text-[var(--ink)]">
                          {formatMoney(estimate, currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-muted)]">
                          Not set
                        </span>
                      )}
                    </td>

                    {/* Sent date */}
                    <td className="hidden px-3 py-2.5 text-[10px] text-[var(--ink-muted)] lg:table-cell">
                      {job.quotedAt ? (
                        <span className="text-emerald-600">
                          ✓ {formatEATDate(job.quotedAt)}
                        </span>
                      ) : (
                        <span className="italic">Not sent</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {canGenerate ? (
                          <>
                            {/* PDF */}
                            <a
                              href={pdfHref}
                              target="_blank"
                              rel="noreferrer"
                              title="Open quotation PDF"
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              PDF
                            </a>

                            {/* Copy quote link */}
                            <CopyButton
                              text={pdfUrl}
                              label="Copy"
                              title="Copy quotation PDF link"
                            />

                            {/* WhatsApp */}
                            <a
                              href={`https://wa.me/${waPhone}?text=${waQuoteText}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Send quote via WhatsApp"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-500/20"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                              Send
                            </a>

                            {/* Mark as sent (if not yet sent) */}
                            {!job.quotedAt && (
                              <form action={markSent}>
                                <input type="hidden" name="jobId" value={job.id} />
                                <button
                                  type="submit"
                                  title="Mark quotation as sent"
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 transition hover:bg-sky-500/20"
                                >
                                  ✓ Mark sent
                                </button>
                              </form>
                            )}
                            <form action={convertQuotationToInvoiceAction}>
                              <input type="hidden" name="jobId" value={job.id} />
                              {persistedQuotation ? <input type="hidden" name="quotationId" value={persistedQuotation.id} /> : null}
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                              >
                                Convert to Invoice
                              </button>
                            </form>
                          </>
                        ) : (
                          <span className="text-[11px] text-[var(--ink-muted)]">
                            {["RECEIVED"].includes(job.status)
                              ? "Needs diagnosis"
                              : "No estimate yet"}
                          </span>
                        )}

                        {/* Always show view job link */}
                        <Link
                          href={`/jobs/${job.id}`}
                          title="Open job detail"
                          className="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[11px] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        >
                          →
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sorted.length >= 100 && (
        <p className="text-center text-xs text-[var(--ink-muted)]">
          Showing first 100 — use filter to narrow down.
        </p>
      )}
    </section>
  );
}
