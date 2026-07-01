import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { CopyButton } from "@/components/shared/CopyButton";
import { RowActionsMenu, MenuSection, MenuActionLink, MenuActionButton } from "@/components/shared/RowActionsMenu";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";
import { formatEATDate } from "@/lib/date-eat";
import { normalizeJobStatus } from "@/lib/job-status";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ensureQuotationFromJob } from "@/lib/commercial/document-workflow";

function DeviceIcon({ type }: { type: string }) {
  const cls = "inline-block h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]";
  switch (type) {
    case "PHONE_ANDROID":
    case "PHONE_IPHONE":
      return <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true"><path d="M10 2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4Zm3 14.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>;
    case "TABLET":
      return <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true"><path fillRule="evenodd" d="M3 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V2Zm5 3.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H8.5a.5.5 0 0 1-.5-.5v-9Z" clipRule="evenodd" /></svg>;
    case "WINDOWS_PC":
      return <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true"><path fillRule="evenodd" d="M2 4.5A2.5 2.5 0 0 1 4.5 2h11A2.5 2.5 0 0 1 18 4.5v8A2.5 2.5 0 0 1 15.5 15h-4a1.5 1.5 0 0 0 0 3h4a.5.5 0 0 0 .5-.5v-6a.5.5 0 0 0-.5-.5h-11a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h4a1.5 1.5 0 0 0 1.5-1.5v-8ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clipRule="evenodd" /></svg>;
    case "MAC":
      return <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true"><path fillRule="evenodd" d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM7 6a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm3.5 8.5a.5.5 0 0 1 .5-.5h1.5a.5.5 0 0 1 0 1H11v1a.5.5 0 0 1-1 0V14.5a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1 0-1h2Z" clipRule="evenodd" /></svg>;
    default:
      return <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true"><path fillRule="evenodd" d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM4.496 6.448a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566Zm8.008 0a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566ZM7.496 10.496a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566Zm4.008 0a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566ZM7.496 14.544a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566Zm4.008 0a.75.75 0 1 1 1.008-.89l.256 2.566a.75.75 0 0 1-1.008.89l-.256-2.566ZM6 8a6 6 0 1 0 8 0A6 6 0 0 0 6 8Zm1.5-2a.5.5 0 0 0 0-1 .5.5 0 0 0 0 1Z" clipRule="evenodd" /></svg>;
  }
}

type SearchParams = { q?: string; status?: string; period?: string };

export default async function JobCardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.generateJobCards(user)) redirect("/dashboard");
  await requireModule(OrgModule.JOBS);

  const { q, status: statusFilter, period: periodFilter = "all" } = await searchParams;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  async function convertJobCardToQuotationAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!(["ADMIN", "OPS", "MANAGER", "SALES", "FINANCE"].includes(user.role) || can.viewFinancials(user))) return;
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!jobId) return;

    const quotation = await prisma.$transaction(async (tx) => {
      const quotation = await ensureQuotationFromJob(tx, { orgId, jobId, userId: user.id, currency: org.baseCurrency });
      return quotation ? { id: quotation.id, quoteNumber: quotation.quoteNumber } : null;
    });
    if (quotation) {
      await writeSystemAuditEvent({ orgId, actorUserId: user.id, entityType: "Quotation", entityId: quotation.id, action: "JOB_CARD_CONVERTED_TO_QUOTATION", summary: `Job card converted to quotation ${quotation.quoteNumber}` });
    }

    revalidatePath("/documents/job-cards");
    revalidatePath("/documents/quotations");
  }

  const jobs = await prisma.job.findMany({
    where: {
      orgId,
      ...(statusFilter ? { status: statusFilter as never } : {}),
      ...(periodFilter === "this_month" ? { receivedAt: { gte: thisMonthStart } } : {}),
      ...(periodFilter === "last_month" ? { receivedAt: { gte: lastMonthStart, lte: lastMonthEnd } } : {}),
      ...(q
        ? {
            OR: [
              { jobNumber: { contains: q } },
              { client: { fullName: { contains: q } } },
              { brand: { contains: q } },
              { model: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
    select: {
      id: true,
      jobNumber: true,
      status: true,
      brand: true,
      model: true,
      deviceType: true,
      issueDescription: true,
      receivedAt: true,
      client: { select: { fullName: true, phone: true } },
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const STATUS_OPTIONS = [
    "RECEIVED",
    "DIAGNOSING",
    "AWAITING_APPROVAL",
    "IN_REPAIR",
    "READY_FOR_PICKUP",
    "COMPLETED",
  ];

  return (
    <section className="space-y-4">

      {/* ── Mobile: tap any job → Job Card button at the bottom ── */}
      <div className="sm:hidden rounded-2xl border border-sky-500/20 bg-sky-500/6 px-4 py-3">
        <p className="text-[12px] font-semibold text-sky-500 mb-1">Print a job card</p>
        <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed">
          Tap any job below → the <strong className="text-[var(--ink)]">Generate Job Card</strong> button appears at the bottom of the screen — prints or downloads instantly.
        </p>
      </div>

      {/* Header bar */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Job Cards{" "}
            <span className="font-normal text-[var(--ink-muted)]">· {jobs.length}</span>
          </p>
        </div>
        <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
          New Repair Job
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Showing", value: jobs.length, sub: "job cards" },
          { label: "In Repair", value: jobs.filter(j => j.status === "IN_REPAIR").length, sub: "active repairs" },
          { label: "Ready Pickup", value: jobs.filter(j => j.status === "READY_FOR_PICKUP").length, sub: "awaiting collection", tone: jobs.filter(j => j.status === "READY_FOR_PICKUP").length > 0 ? "text-emerald-600" : "text-[var(--ink)]" },
          { label: "Awaiting Approval", value: jobs.filter(j => j.status === "AWAITING_APPROVAL").length, sub: "need decision", tone: jobs.filter(j => j.status === "AWAITING_APPROVAL").length > 0 ? "text-amber-600" : "text-[var(--ink)]" },
        ].map(({ label, value, sub, tone = "text-[var(--ink)]" }) => (
          <div key={label} className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Period chips */}
      <div className="flex gap-2">
        {([
          { label: "All time", value: "all" },
          { label: "This month", value: "this_month" },
          { label: "Last month", value: "last_month" },
        ] as const).map(({ label, value }) => (
          <Link key={value}
            href={`/documents/job-cards?${new URLSearchParams({ ...(q ? { q } : {}), ...(statusFilter ? { status: statusFilter } : {}), period: value === "all" ? "" : value }).toString()}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${periodFilter === value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"}`}>
            {label}
          </Link>
        ))}
      </div>

      {/* Search + filter */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input type="hidden" name="period" value={periodFilter === "all" ? "" : periodFilter} />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search job #, client, device…"
          className="flex-1 min-w-[180px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none focus:border-[var(--accent)]/50"
        />
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/40"
        >
          Filter
        </button>
        {(q || statusFilter) && (
          <Link
            href="/documents/job-cards"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="doc-list overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2.5">Job</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Client</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Device</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Received</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]"
                >
                  {q || statusFilter
                    ? "No jobs match your filter."
                    : "No jobs yet. Create a job first."}
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const jobUrl = `${appUrl}/jobs/${job.id}`;
                const pdfHref = `/api/jobs/${job.id}/job-card`;
                const clientPhone = job.client.phone.replace(/\D/g, "");
                const waPhone = clientPhone.startsWith("0")
                  ? "256" + clientPhone.slice(1)
                  : clientPhone;
                const waText = encodeURIComponent(
                  `Hi ${job.client.fullName}, your device (${job.brand} ${job.model}) has been received at our workshop.\n\nJob #: ${job.jobNumber}\nIssue noted: ${job.issueDescription.slice(0, 80)}${job.issueDescription.length > 80 ? "…" : ""}\n\nWe'll update you as soon as diagnosis is complete.`,
                );
                const normalStatus = normalizeJobStatus(job.status as never);

                return (
                  <tr
                    key={job.id}
                    className="border-t border-[var(--line)] transition hover:bg-[var(--panel-strong)]/40"
                  >
                    {/* Job # */}
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="mono text-xs font-bold text-[var(--accent)] hover:underline"
                      >
                        {job.jobNumber}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-[var(--ink-muted)] sm:hidden">
                        {job.client.fullName}
                      </p>
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
                      <span className="mr-1.5 align-middle">
                        <DeviceIcon type={job.deviceType} />
                      </span>
                      <span className="text-xs text-[var(--ink)]">
                        {job.brand} {job.model}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <JobStatusBadge status={normalStatus} />
                    </td>

                    {/* Received */}
                    <td className="hidden px-3 py-2.5 text-xs text-[var(--ink-muted)] lg:table-cell">
                      {formatEATDate(job.receivedAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Primary: Print PDF */}
                        <a
                          href={pdfHref}
                          target="_blank"
                          rel="noreferrer"
                          title="Open job card PDF"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                            <path fillRule="evenodd" d="M5.75 4A1.75 1.75 0 0 0 4 5.75v7A1.75 1.75 0 0 0 5.75 14.5h8.5A1.75 1.75 0 0 0 16 12.75v-7A1.75 1.75 0 0 0 14.25 4H5.75ZM5 5.75a.25.25 0 0 1 .25-.25h8.5a.25.25 0 0 1 .25.25v7a.25.25 0 0 1-.25.25H5.25a.25.25 0 0 1-.25-.25v-7Zm7.5 6.5a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1 0-1.5h6.5Z" clipRule="evenodd" />
                          </svg>
                        </a>

                        {/* Overflow: convert, share */}
                        <RowActionsMenu label="Job card actions">
                          <MenuSection label="Actions" />
                          <MenuActionLink href={`/api/jobs/${job.id}/job-card`} external icon="job" tone="accent">
                            Download Job Card PDF
                          </MenuActionLink>
                          <form action={convertJobCardToQuotationAction} className="px-3 py-1.5">
                            <input type="hidden" name="jobId" value={job.id} />
                            <MenuActionButton icon="quote" tone="accent">
                              Convert to Quotation
                            </MenuActionButton>
                          </form>
                          <MenuActionLink href={`https://wa.me/${waPhone}?text=${waText}`} external icon="whatsapp" tone="success">
                            Send via WhatsApp
                          </MenuActionLink>
                          <div className="px-3 py-1.5">
                            <CopyButton
                              text={jobUrl}
                              label="Copy job link"
                              title="Copy job page link"
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]"
                            />
                          </div>
                        </RowActionsMenu>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {jobs.length >= 100 && (
        <p className="text-center text-xs text-[var(--ink-muted)]">
          Showing first 100 results — use the filter above to narrow down.
        </p>
      )}
    </section>
  );
}
