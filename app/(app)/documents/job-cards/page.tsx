import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { CopyButton } from "@/components/shared/CopyButton";
import { RowActionsMenu, MenuSection } from "@/components/shared/RowActionsMenu";
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
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      );
    case "TABLET":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      );
    case "WINDOWS_PC":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      );
    case "MAC":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55A1 1 0 0 1 20.38 20H3.62a1 1 0 0 1-.9-1.45L4 16"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      );
  }
}

type SearchParams = { q?: string; status?: string };

export default async function JobCardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();
  if (!can.generateJobCards(user)) redirect("/dashboard");
  await requireModule(OrgModule.JOBS);

  const { q, status: statusFilter } = await searchParams;

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
      {/* Header bar */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Documents</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Job Cards{" "}
            <span className="font-normal text-[var(--ink-muted)]">· {jobs.length}</span>
          </p>
        </div>
        <Link href="/jobs/new" className="btn-premium rounded-lg px-3 py-1.5 text-[12px]">
          Create Job Card
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
          <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
                const pdfUrl = `${appUrl}/api/jobs/${job.id}/job-card`;
                const jobUrl = `${appUrl}/jobs/${job.id}`;
                const pdfHref = `/api/jobs/${job.id}/job-card`;
                const jobHref = `/jobs/${job.id}`;
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
                      <p className="mt-0.5 text-[10px] text-[var(--ink-muted)] sm:hidden">
                        {job.client.fullName}
                      </p>
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
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        </a>

                        {/* Overflow: convert, share */}
                        <RowActionsMenu label="Job card actions">
                          <MenuSection label="Actions" />
                          <form action={convertJobCardToQuotationAction} className="px-3 py-1.5">
                            <input type="hidden" name="jobId" value={job.id} />
                            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink)] transition hover:bg-[var(--panel-strong)]">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="18" y2="12"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
                              Convert to Quotation
                            </button>
                          </form>
                          <a
                            href={`https://wa.me/${waPhone}?text=${waText}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex w-full items-center gap-2 px-5 py-1.5 text-[12px] font-medium text-emerald-600 transition hover:bg-[var(--panel-strong)]"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                            Send via WhatsApp
                          </a>
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
