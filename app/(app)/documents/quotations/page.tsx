import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { CopyButton } from "@/components/shared/CopyButton";
import { RowActionsMenu, MenuSection, MenuActionLink, MenuActionButton } from "@/components/shared/RowActionsMenu";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
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
import { JobStatus, OutboundMessageType, QuotationStatus } from "@prisma/client";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ensureInvoiceFromQuotation, ensureQuotationFromJob } from "@/lib/commercial/document-workflow";
import { sendQuotationViaWhatsAppAction } from "@/app/(app)/jobs/[id]/actions";
import { enqueueEmailMessage } from "@/lib/notifications/whatsapp-outbox";

type SearchParams = { q?: string; approval?: string; period?: string };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!(can.createQuotations(user) || can.viewFinancials(user))) {
    redirect("/dashboard");
  }
  await requireModule(OrgModule.INVOICING);

  const { q, approval: approvalFilter, period: periodFilter = "all" } = await searchParams;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const currency = getAppCurrency();

  // ── Server action: mark quotation as sent (sets quotedAt = now) ──────────
  async function markSent(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.createQuotations(user) || can.viewFinancials(user))) return;
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
    if (!(can.createInvoices(user) || can.approveInvoices(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const jobId = String(formData.get("jobId") ?? "").trim();
    const quotationId = String(formData.get("quotationId") ?? "").trim();
    if (!jobId && !quotationId) return;

    const result = await prisma.$transaction(async (tx) => {
      const quotation = quotationId
        ? await tx.quotation.findFirst({
            where: {
              id: quotationId,
              orgId,
              status: "ACCEPTED",
              convertedToInvoiceId: null,
              ...(!can.viewAllSales(user) && !can.approveInvoices(user) ? { createdById: user.id } : {}),
            },
            include: { items: true },
          })
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

  async function sendQuotationWhatsAppAction(formData: FormData) {
    "use server";
    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!jobId) return;
    await sendQuotationViaWhatsAppAction(jobId);
    revalidatePath("/documents/quotations");
  }

  async function sendQuotationEmailAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(can.createQuotations(user) || can.viewFinancials(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!jobId) return;
    const job = await prisma.job.findFirst({
      where: { id: jobId, orgId },
      select: {
        id: true,
        jobNumber: true,
        brand: true,
        model: true,
        clientBill: true,
        client: { select: { fullName: true, email: true } },
      },
    });
    if (!job?.client.email) return;

    const quoteNumber = String(formData.get("quoteNumber") ?? "").trim() || `Quote for ${job.jobNumber}`;
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/jobs/${job.id}/quotation`;
    const body = [
      `Hi ${job.client.fullName},`,
      "",
      `Your repair quotation is ready.`,
      `Quote: ${quoteNumber}`,
      `Job: ${job.jobNumber}`,
      `Device: ${job.brand} ${job.model}`,
      job.clientBill ? `Estimate: ${formatMoney(job.clientBill, getAppCurrency())}` : null,
      "",
      `Download PDF: ${pdfUrl}`,
    ].filter(Boolean).join("\n");

    await enqueueEmailMessage({
      orgId,
      jobId: job.id,
      to: job.client.email,
      subject: `Quotation ${quoteNumber}`,
      body,
      type: OutboundMessageType.JOB_STATUS_UPDATE,
    });
    revalidatePath("/documents/quotations");
  }

  async function updateQuotationStatusAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });
    const quotationId = String(formData.get("quotationId") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();
    if (!quotationId || !["SENT", "ACCEPTED", "REJECTED"].includes(status)) return;

    if (status === "SENT" && !can.createQuotations(user)) return;
    if (status === "ACCEPTED" && !can.approveQuotations(user)) return;
    if (status === "REJECTED" && !can.createQuotations(user)) return;

    const accessWhere = {
      id: quotationId,
      orgId,
      ...(status === "ACCEPTED" || can.viewAllSales(user) ? {} : { createdById: user.id }),
    };
    const quote = await prisma.quotation.findFirst({ where: accessWhere, select: { id: true, leadId: true } });
    if (!quote) return;
    const now = new Date();
    await prisma.quotation.updateMany({
      where: accessWhere,
      data: {
        status: status as QuotationStatus,
        ...(status === "SENT" ? { sentAt: now } : {}),
        ...(status === "ACCEPTED" ? { acceptedAt: now, approvedById: user.id } : {}),
        ...(status === "REJECTED" ? { rejectedAt: now } : {}),
      },
    });
    if (quote.leadId && status === "ACCEPTED") {
      await prisma.lead.updateMany({ where: { id: quote.leadId, orgId }, data: { status: "WON", convertedAt: now, closedAt: null, lostReason: null } });
    }
    revalidatePath("/documents/quotations");
    revalidatePath(`/sales/quotations/${quotationId}`);
  }

  async function updateQuotationDetailsAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.createQuotations(user)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const quotationId = String(formData.get("quotationId") ?? "").trim();
    if (!quotationId) return;
    const validUntilRaw = String(formData.get("validUntil") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    await prisma.quotation.updateMany({
      where: {
        id: quotationId,
        orgId,
        status: "DRAFT",
        convertedToInvoiceId: null,
        ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
      },
      data: {
        validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
        notes: notes || null,
      },
    });
    revalidatePath("/documents/quotations");
    revalidatePath(`/sales/quotations/${quotationId}`);
  }

  async function deleteQuotationRowAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.createQuotations(user)) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const quotationId = String(formData.get("quotationId") ?? "").trim();
    if (!quotationId) return;
    await prisma.quotation.deleteMany({
      where: {
        id: quotationId,
        orgId,
        status: "DRAFT",
        convertedToInvoiceId: null,
        ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
      },
    });
    revalidatePath("/documents/quotations");
  }

  const [jobs, branding] = await Promise.all([
    prisma.job.findMany({
      where: {
        orgId,
        ...(!can.viewAllSales(user) && !can.viewFinancials(user) ? { OR: [{ assignedToId: user.id }, { createdById: user.id }] } : {}),
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
        client: { select: { fullName: true, phone: true, email: true } },
        quotations: { select: { id: true, quoteNumber: true, status: true, validUntil: true, notes: true, convertedToInvoiceId: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    getDocumentBrandingSettings(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const pendingCount = jobs.filter(
    (j) => j.status === "AWAITING_APPROVAL" && j.clientApproved === null,
  ).length;

  // Period filter applied client-side (jobs are already fetched)
  const periodFilteredJobs = jobs.filter((j) => {
    if (periodFilter === "this_month") return j.updatedAt >= thisMonthStart;
    if (periodFilter === "last_month") return j.updatedAt >= lastMonthStart && j.updatedAt <= lastMonthEnd;
    return true;
  });

  // Sort: AWAITING_APPROVAL first, then by updatedAt desc
  const sorted = [...periodFilteredJobs].sort((a, b) => {
    const aAw = a.status === "AWAITING_APPROVAL" ? 0 : 1;
    const bAw = b.status === "AWAITING_APPROVAL" ? 0 : 1;
    if (aAw !== bAw) return aAw - bAw;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const nowMs = Date.now();

  return (
    <section className="space-y-4">

      {/* ── Mobile quick-gen explainer ── */}
      <div className="sm:hidden rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/6 px-4 py-3">
        <p className="text-[12px] font-semibold text-[var(--accent)] mb-1">How to create a quote</p>
        <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed">
          Quotes are generated from repair jobs. Open a job that is in <strong className="text-[var(--ink)]">Diagnosing</strong> or <strong className="text-[var(--ink)]">In Repair</strong> status, then tap <strong className="text-[var(--ink)]">Generate Quote</strong> from the action bar.
        </p>
        <Link
          href="/jobs?status=DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR"
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-[12px] font-bold text-[var(--accent)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          Go to eligible jobs
        </Link>
      </div>

      {/* Header */}
      <div className="panel-shadow hidden sm:flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">
              Quotations{" "}
              <span className="font-normal text-[var(--ink-muted)]">
                · {jobs.length}
              </span>
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[12px] font-bold text-amber-600">
              {pendingCount} awaiting client
            </span>
          )}
        </div>
        {/* Quotations are generated from jobs — link to the job queue to find the job */}
        <Link href="/jobs?status=DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
          + New Quote
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total Quotes", value: jobs.length, sub: "all time" },
          { label: "Awaiting Client", value: pendingCount, sub: "need decision", tone: pendingCount > 0 ? "text-amber-600" : "text-[var(--ink)]" },
          { label: "Approved", value: jobs.filter(j => j.clientApproved === true).length, sub: "accepted", tone: "text-emerald-600" },
          { label: "Declined", value: jobs.filter(j => j.clientApproved === false).length, sub: "rejected", tone: "text-red-500" },
        ].map(({ label, value, sub, tone = "text-[var(--ink)]" }) => (
          <div key={label} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <form method="GET" className="hidden lg:flex flex-wrap gap-2">
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

      {/* Period chips */}
      <div className="flex gap-2">
        {([
          { label: "All time", value: "all" },
          { label: "This month", value: "this_month" },
          { label: "Last month", value: "last_month" },
        ] as const).map(({ label, value }) => (
          <Link key={value}
            href={`/documents/quotations?${new URLSearchParams({ ...(q ? { q } : {}), ...(approvalFilter ? { approval: approvalFilter } : {}), period: value === "all" ? "" : value }).toString()}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${(periodFilter ?? "all") === value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"}`}>
            {label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="doc-list overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[12px] font-bold text-emerald-600">
                      Approved
                    </span>
                  ) : job.clientApproved === false ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-500">
                      Declined
                    </span>
                  ) : job.status === "AWAITING_APPROVAL" ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-bold text-amber-600 animate-pulse">
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
                const canOpenPersistedQuote = Boolean(persistedQuotation);
                const canEditDraftQuote = Boolean(
                  persistedQuotation &&
                  persistedQuotation.status === "DRAFT" &&
                  !persistedQuotation.convertedToInvoiceId &&
                  can.createQuotations(user),
                );
                const canSendPersistedQuote = Boolean(
                  persistedQuotation &&
                  persistedQuotation.status === "DRAFT" &&
                  can.createQuotations(user),
                );
                const canAcceptPersistedQuote = Boolean(
                  persistedQuotation &&
                  persistedQuotation.status === "SENT" &&
                  can.approveQuotations(user),
                );
                const canRejectPersistedQuote = Boolean(
                  persistedQuotation &&
                  persistedQuotation.status === "SENT" &&
                  can.createQuotations(user),
                );
                const canConvertPersistedQuote = Boolean(
                  persistedQuotation &&
                  persistedQuotation.status === "ACCEPTED" &&
                  !persistedQuotation.convertedToInvoiceId &&
                  (can.createInvoices(user) || can.approveInvoices(user)),
                );

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
                        <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                          {quoteNumber}
                        </p>
                      )}
                      {/* Mobile: show client + approval inline */}
                      <p className="mt-0.5 text-[12px] text-[var(--ink-muted)] sm:hidden">
                        {job.client.fullName}
                      </p>
                      <div className="mt-1 sm:hidden">{approvalBadge}</div>
                    </td>

                    {/* Client */}
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <p className="text-xs font-medium text-[var(--ink)]">
                        {job.client.fullName}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
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
                            className={`text-[12px] font-medium ${daysPending >= 3 ? "text-red-400" : "text-amber-600"}`}
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
                    <td className="hidden px-3 py-2.5 text-[12px] text-[var(--ink-muted)] lg:table-cell">
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
                      <div className="flex items-center justify-end gap-1.5">
                        {canGenerate ? (
                          <>
                            {/* Primary: PDF */}
                            <a
                              href={pdfHref}
                              target="_blank"
                              rel="noreferrer"
                              title="Open quotation PDF"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </a>

                            {/* Overflow: share, mark sent, convert */}
                            <RowActionsMenu label="Quotation actions">
                              <div className="py-1 text-left">
                                {canOpenPersistedQuote ? (
                                  <MenuActionLink href={`/sales/quotations/${persistedQuotation!.id}`} icon="open">
                                    Open Quotation
                                  </MenuActionLink>
                                ) : null}
                                <MenuActionLink href={`/jobs/${job.id}`} icon="job">
                                  Open Job
                                </MenuActionLink>
                                <MenuActionLink href={pdfHref} external icon="quote" tone="accent">
                                  Download Quotation PDF
                                </MenuActionLink>
                              </div>
                              <MenuSection label="Share" />
                              <form action={sendQuotationWhatsAppAction}>
                                <input type="hidden" name="jobId" value={job.id} />
                                <MenuActionButton icon="whatsapp" tone="success">
                                  Send via WhatsApp
                                </MenuActionButton>
                              </form>
                              {job.client.email ? (
                                <form action={sendQuotationEmailAction}>
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="quoteNumber" value={persistedQuotation?.quoteNumber ?? quoteNumber} />
                                  <MenuActionButton icon="open">
                                    Email quotation
                                  </MenuActionButton>
                                </form>
                              ) : (
                                <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Email unavailable</span>
                              )}
                              <MenuActionLink href={`https://wa.me/${waPhone}?text=${waQuoteText}`} external icon="whatsapp" tone="success">
                                Open WhatsApp Link
                              </MenuActionLink>
                              <div className="px-3 py-1">
                                <CopyButton
                                  text={pdfUrl}
                                  label="Copy PDF link"
                                  title="Copy quotation PDF link"
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]"
                                />
                              </div>
                              {canEditDraftQuote ? (
                                <>
                                  <MenuSection label="Edit Draft" />
                                  <form action={updateQuotationDetailsAction} className="space-y-2 p-3">
                                    <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                    <input
                                      type="date"
                                      name="validUntil"
                                      defaultValue={persistedQuotation!.validUntil ? persistedQuotation!.validUntil.toISOString().slice(0, 10) : ""}
                                      className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                                    />
                                    <textarea
                                      name="notes"
                                      defaultValue={persistedQuotation!.notes ?? ""}
                                      placeholder="Notes"
                                      className="min-h-14 w-full rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-xs outline-none"
                                    />
                                    <MenuActionButton icon="save" tone="accent">
                                      Save Draft
                                    </MenuActionButton>
                                  </form>
                                </>
                              ) : null}
                              {(!job.quotedAt || canSendPersistedQuote || canAcceptPersistedQuote || canRejectPersistedQuote) && (
                                <>
                                  <MenuSection label="Status" />
                                  {!job.quotedAt ? (
                                    <form action={markSent} className="px-3 py-1.5">
                                      <input type="hidden" name="jobId" value={job.id} />
                                      <MenuActionButton icon="save" tone="accent">
                                        Mark as sent
                                      </MenuActionButton>
                                    </form>
                                  ) : null}
                                  {canSendPersistedQuote ? (
                                    <form action={updateQuotationStatusAction} className="px-3 py-1.5">
                                      <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                      <input type="hidden" name="status" value="SENT" />
                                      <MenuActionButton icon="save" tone="accent">
                                        Send to Client
                                      </MenuActionButton>
                                    </form>
                                  ) : null}
                                  {canAcceptPersistedQuote ? (
                                    <form action={updateQuotationStatusAction} className="px-3 py-1.5">
                                      <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                      <input type="hidden" name="status" value="ACCEPTED" />
                                      <MenuActionButton icon="save" tone="success">
                                        Mark Accepted
                                      </MenuActionButton>
                                    </form>
                                  ) : null}
                                  {canRejectPersistedQuote ? (
                                    <form action={updateQuotationStatusAction} className="px-3 py-1.5">
                                      <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                      <input type="hidden" name="status" value="REJECTED" />
                                      <MenuActionButton icon="close" tone="danger">
                                        Mark Rejected
                                      </MenuActionButton>
                                    </form>
                                  ) : null}
                                </>
                              )}
                              <MenuSection label="Convert" />
                              {canConvertPersistedQuote ? (
                                <form action={convertQuotationToInvoiceAction} className="px-3 py-1.5">
                                  <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                  <MenuActionButton icon="invoice" tone="accent">
                                    Convert to Invoice
                                  </MenuActionButton>
                                </form>
                              ) : persistedQuotation?.convertedToInvoiceId ? (
                                <MenuActionLink href="/documents/invoices" icon="invoice" tone="success">
                                  Invoice Created
                                </MenuActionLink>
                              ) : (
                                <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">
                                  Accept quotation before converting
                                </span>
                              )}
                              {canEditDraftQuote ? (
                                <>
                                  <MenuSection label="Delete" />
                                  <form action={deleteQuotationRowAction} className="px-3 py-1.5">
                                    <input type="hidden" name="quotationId" value={persistedQuotation!.id} />
                                    <ConfirmSubmitButton
                                      message={`Delete draft quotation ${persistedQuotation!.quoteNumber}? This cannot be undone.`}
                                      confirmLabel="Delete"
                                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700"
                                    >
                                      Delete Draft
                                    </ConfirmSubmitButton>
                                  </form>
                                </>
                              ) : null}
                            </RowActionsMenu>
                          </>
                        ) : (
                          <span className="text-[13px] text-[var(--ink-muted)]">
                            {["RECEIVED"].includes(job.status) ? "Needs diagnosis" : "No estimate yet"}
                          </span>
                        )}

                        {/* Always: view job */}
                        <Link
                          href={`/jobs/${job.id}`}
                          title="Open job"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
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
