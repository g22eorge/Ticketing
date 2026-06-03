import Link from "next/link";
import { Role } from "@prisma/client";

function deviceName(brand?: string | null, model?: string | null) {
  const b = brand && brand !== "Unknown" ? brand : "";
  const m = model && model !== "Unknown" ? model : "";
  return [b, m].filter(Boolean).join(" ") || null;
}

function jobAgeDays(receivedAt: Date): number {
  return Math.floor((Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24));
}

function AgeBadge({ receivedAt, status }: { receivedAt: Date; status: string }) {
  const terminal = status === "COMPLETED" || status === "CLOSED";
  const days = jobAgeDays(receivedAt);
  if (terminal) {
    return <span className="text-[13px] tabular-nums text-[var(--ink-muted)]/50">{days}d</span>;
  }
  const cls =
    days >= 8
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : days >= 4
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[13px] font-semibold tabular-nums ${cls}`}>
      {days}d
    </span>
  );
}


import { JobStatusBadge, statusStripClass } from "@/components/jobs/JobStatusBadge";
import { normalizeJobStatus } from "@/lib/job-status";

function statusAvatarClass(status: string): string {
  const s = normalizeJobStatus(status as JobStatus);
  const map: Record<string, string> = {
    RECEIVED:          "bg-sky-400/15 text-sky-600",
    DIAGNOSING:        "bg-blue-500/15 text-blue-600",
    REFERRED:          "bg-violet-500/15 text-violet-600",
    AWAITING_APPROVAL: "bg-orange-400/15 text-orange-600",
    IN_REPAIR:         "bg-violet-500/15 text-violet-600",
    READY_FOR_PICKUP:  "bg-[var(--accent)]/15 text-[var(--accent)]",
    COMPLETED:         "bg-emerald-500/15 text-emerald-600",
    CLOSED:            "bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  };
  return map[s] ?? "bg-[var(--panel-strong)] text-[var(--ink-muted)]";
}
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";
import { RowActionsMenu, MenuActionLink } from "@/components/shared/RowActionsMenu";

export type JobRow = {
  id: string;
  jobNumber: string;
  status: JobStatus;
  deviceType: string;
  brand: string;
  model: string;
  clientName?: string;
  assignedTo?: string;
  receivedAt: Date;
  updatedAt?: Date;
  externalTechBill?: number | null;
  clientBill?: number | null;
  clientPaid?: boolean | null;
  repairTimeline?: string | null;
  workflowReason?: WorkflowReason | null;
};

type WorkflowReason =
  | "NONE"
  | "PARTS_PENDING"
  | "SPECIALIST_ESCALATION"
  | "CLIENT_DECLINED"
  | "UNREPAIRABLE"
  | "CUSTOMER_CANCELLED"
  | "OTHER";

type HighlightReason = Exclude<WorkflowReason, "NONE">;

const workflowReasonConfig: Record<HighlightReason, { badge: string; label: string }> = {
  PARTS_PENDING:        { badge: "bg-amber-500/10 text-amber-700 border border-amber-400/30 dark:text-amber-400",   label: "Parts pending" },
  SPECIALIST_ESCALATION:{ badge: "bg-violet-500/10 text-violet-700 border border-violet-400/30 dark:text-violet-400", label: "Escalated" },
  CLIENT_DECLINED:      { badge: "bg-red-500/10 text-red-700 border border-red-400/30 dark:text-red-400",           label: "Declined" },
  UNREPAIRABLE:         { badge: "bg-red-500/10 text-red-700 border border-red-400/30 dark:text-red-400",           label: "Unrepairable" },
  CUSTOMER_CANCELLED:   { badge: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",    label: "Cancelled" },
  OTHER:                { badge: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",    label: "Other" },
};

type JobListFlag = { badge: string; label: string };

function getJobListFlag(job: JobRow, canManagePricing: boolean): JobListFlag | null {
  const billed = typeof job.clientBill === "number" ? job.clientBill : null;
  const billableTerminal = invoiceStatuses.has(job.status);

  if (canManagePricing && billableTerminal && billed !== null && billed > 0 && job.clientPaid !== true) {
    return {
      badge: "bg-red-500/10 text-red-700 border border-red-400/30 dark:text-red-400",
      label: `Unpaid ${formatMoney(billed)}`,
    };
  }

  if (job.workflowReason && job.workflowReason !== "NONE") {
    return workflowReasonConfig[job.workflowReason as HighlightReason];
  }

  if (canManagePricing && billed === 0 && ["COMPLETED", "CLOSED"].includes(job.status)) {
    return {
      badge: "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
      label: "No charge",
    };
  }

  if (canManagePricing && typeof job.clientBill !== "number" && ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)) {
    return {
      badge: "border border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Needs pricing",
    };
  }

  if (canManagePricing && typeof job.clientBill === "number") {
    return {
      badge: "bg-[var(--accent)]/10 text-[#7A5F00]",
      label: "Priced",
    };
  }

  return null;
}

const deviceLabel: Record<string, string> = {
  PHONE_ANDROID: "Android",
  PHONE_IPHONE:  "iPhone",
  TABLET:        "Tablet",
  WINDOWS_PC:    "Windows",
  MAC:           "Mac",
  OTHER:         "Other",
};

const quotationStatuses = new Set<JobStatus>([
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
]);

const invoiceStatuses = new Set<JobStatus>(["READY_FOR_PICKUP", "COMPLETED", "CLOSED"]);

/** Small SVG icons for device types */
function DeviceIcon({ type }: { type: string }) {
  if (type === "PHONE_ANDROID" || type === "PHONE_IPHONE") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
        <path d="M5 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H5Zm3 11a.75.75 0 1 1 0 1.5A.75.75 0 0 1 8 12ZM6.5 2.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1Z" />
      </svg>
    );
  }
  if (type === "TABLET") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
        <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2Zm9 11a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
      </svg>
    );
  }
  if (type === "WINDOWS_PC" || type === "MAC") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
        <path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.5L4 14h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.354-.854L5.293 12H3a2 2 0 0 1-2-2V3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path fillRule="evenodd" d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H8.5v2H10a.5.5 0 0 1 0 1H6a.5.5 0 0 1 0-1h1.5v-2H2.5A.5.5 0 0 1 2 10.5v-8Z" clipRule="evenodd" />
    </svg>
  );
}

export function JobTable({
  jobs,
  role,
  permissions = [],
  canDelete,
  deleteAction,
  quickAdvanceAction,
  returnTo,
  pageStart,
  pageEnd,
  total,
  page,
  totalPages,
  isPrevDisabled,
  isNextDisabled,
  prevPageHref,
  nextPageHref,
}: {
  jobs: JobRow[];
  role: Role;
  permissions?: string[];
  canDelete?: boolean;
  deleteAction?: (formData: FormData) => Promise<void>;
  quickAdvanceAction?: (formData: FormData) => Promise<void>;
  returnTo?: string;
  pageStart?: number;
  pageEnd?: number;
  total?: number;
  page?: number;
  totalPages?: number;
  isPrevDisabled?: boolean;
  isNextDisabled?: boolean;
  prevPageHref?: string;
  nextPageHref?: string;
}) {
  const permissionUser = { role, permissions };
  const canSeeClient = role !== "TECHNICIAN_EXTERNAL";
  const canSeeCost =
    can.viewApprovedCost(permissionUser)
    || can.reviewExternalBills(permissionUser)
    || can.approveInvoices(permissionUser);
  const canSeeAssignment = can.assignJobs(permissionUser) || role === "ADMIN" || role === "OPS";
  const canEditPage = role !== "TECHNICIAN_EXTERNAL" && !can.createJob(permissionUser);
  const canManagePricing = can.approveInvoices(permissionUser);
  const canUseJobCards = can.generateJobCards(permissionUser);
  const canUseQuotations = role !== "TECHNICIAN_EXTERNAL" && (["ADMIN", "OPS", "TECHNICIAN_INTERNAL"].includes(role) || can.viewFinancials(permissionUser));
  const canUseInvoices = role !== "TECHNICIAN_EXTERNAL" && can.approveInvoices(permissionUser);
  const showClientFacingCostOnly =
    (can.viewApprovedCost(permissionUser) || canManagePricing)
    && !can.reviewExternalBills(permissionUser);

  const hasPagination = typeof total === "number" && typeof page === "number" && typeof totalPages === "number";

  const paginationBar = hasPagination && (totalPages ?? 0) > 1 ? (
    <div className="flex items-center gap-1.5">
      {isPrevDisabled || !prevPageHref ? (
        <span className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]" aria-disabled="true">
          ← Prev
        </span>
      ) : (
        <Link
          href={prevPageHref}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/6"
        >
          ← Prev
        </Link>
      )}
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-[var(--ink-muted)]">{page} / {totalPages}</span>
      {isNextDisabled || !nextPageHref ? (
        <span className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]" aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link
          href={nextPageHref}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/6"
        >
          Next →
        </Link>
      )}
    </div>
  ) : null;

  return (
    <div className="panel-shadow overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">

      {/* ── Header bar (desktop only — mobile has its own header in page) ── */}
      <div className="hidden lg:flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
        <p className="text-[13px] text-[var(--ink-muted)]">
          {hasPagination ? (
            <>
              <span className="font-bold text-[var(--ink)]">{pageStart}–{pageEnd}</span>
              {" of "}
              <span className="font-bold text-[var(--ink)]">{total}</span>
              <span className="hidden sm:inline"> jobs</span>
            </>
          ) : (
            <><span className="font-bold text-[var(--ink)]">{jobs.length}</span> jobs</>
          )}
        </p>
        {paginationBar}
      </div>

      {/* ── Mobile list — borderless card stack ── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]/60 bg-[var(--panel)] lg:hidden">
        {jobs.map((job) => {
            const flagCfg = getJobListFlag(job, canManagePricing);

            // Compute cost value once
            const costValue = canSeeCost
              ? showClientFacingCostOnly
                ? job.clientBill && ["READY_FOR_PICKUP", "DELIVERED", "COMPLETED", "CLOSED"].includes(job.status)
                  ? formatMoney(job.clientBill)
                  : null
                : job.externalTechBill
                  ? formatMoney(job.externalTechBill)
                  : null
              : null;

            const canDownloadQuotation = canUseQuotations && quotationStatuses.has(job.status);
            const canDownloadInvoice = canUseInvoices && invoiceStatuses.has(job.status);

            // Compute age days for "X days remaining" badge
            const ageDays = Math.floor((Date.now() - job.receivedAt.getTime()) / 86_400_000);
            const isActive = !["COMPLETED", "CLOSED", "DELIVERED"].includes(job.status);

            const name = deviceName(job.brand, job.model) ?? deviceLabel[job.deviceType] ?? job.deviceType;
            const initial = (name[0] ?? "?").toUpperCase();
            const avatarCls = statusAvatarClass(job.status);
            const ageCls = ageDays <= 2 ? "text-emerald-500" : ageDays <= 5 ? "text-amber-500" : "text-red-500";
            const metaParts = [
              canSeeClient && job.clientName ? job.clientName : null,
              job.jobNumber,
              deviceLabel[job.deviceType] ?? job.deviceType,
            ].filter(Boolean);

            // Enhancement 2: red left border for overdue (≥7 days active)
            const isOverdue = isActive && ageDays >= 7;
            // Enhancement 6: last-updated staleness (show when not updated in 48h+)
            const updatedAgo = job.updatedAt
              ? Math.floor((Date.now() - new Date(job.updatedAt).getTime()) / 3600000)
              : null;
            const showStale = updatedAgo !== null && updatedAgo >= 48 && isActive;

            return (
              <div
                key={job.id}
                className={`relative border-b border-[var(--line)]/70 last:border-b-0 ${isOverdue ? "border-l-2 border-l-red-500" : ""}`}
              >
                {/* Link WRAPS the content so taps always fire navigation */}
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex items-center gap-3 px-4 py-3 pr-16 active:bg-[var(--panel-strong)]/60 lg:pr-32"
                  aria-label={`Open job ${job.jobNumber}`}
                >
                  {/* Status-colored avatar */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${avatarCls}`}>
                    {initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Row 1: device name + age */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[14px] font-bold text-[var(--ink)]">{name}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {costValue ? (
                          <span className="text-[12px] font-black tabular-nums text-[var(--ink)]">{costValue}</span>
                        ) : null}
                        {isActive ? (
                          <span className={`text-[12px] font-bold ${ageCls}`}>
                            {job.repairTimeline ?? `${ageDays}d`}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Row 2: meta + status badge */}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-[var(--ink-muted)]">
                        {metaParts.join(" · ")}
                        {/* Enhancement 6: show stale indicator */}
                        {showStale && (
                          <span className="ml-1 text-amber-600">· no update {updatedAgo}h</span>
                        )}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        {flagCfg ? (
                          <span className={`rounded px-1.5 py-0.5 text-[13px] font-semibold ${flagCfg.badge}`}>
                            {flagCfg.label}
                          </span>
                        ) : null}
                        <JobStatusBadge status={job.status} />
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Enhancement 1: Quick advance button for RECEIVED → DIAGNOSING */}
                {job.status === "RECEIVED" && quickAdvanceAction ? (
                  <form action={quickAdvanceAction} className="flex border-t border-[var(--line)]/50 lg:hidden">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="toStatus" value="DIAGNOSING" />
                    <button type="submit"
                      className="flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-sky-600 transition active:bg-sky-500/10">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      Start diagnosis
                    </button>
                  </form>
                ) : null}

                {/* Mobile row action menu */}
                {(canUseJobCards || canDownloadQuotation || canDownloadInvoice || canEditPage || (canDelete && deleteAction)) ? (
                  <div className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 lg:hidden">
                    <RowActionsMenu label={`More actions for ${job.jobNumber}`}>
                      <div className="py-1 text-left">
                        {canEditPage ? (
                          <MenuActionLink href={`/jobs/${job.id}/edit${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`} icon="edit">
                            Edit Job
                          </MenuActionLink>
                        ) : null}
                        {canUseJobCards ? (
                          <MenuActionLink href={`/api/jobs/${job.id}/job-card`} external icon="job" tone="accent">
                            Download Job Card
                          </MenuActionLink>
                        ) : null}
                        {canDownloadQuotation ? (
                          <MenuActionLink href={`/api/jobs/${job.id}/quotation`} external icon="quote" tone="accent">
                            Download Quotation
                          </MenuActionLink>
                        ) : canUseQuotations ? (
                          <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Quotation unavailable</span>
                        ) : null}
                        {canDownloadInvoice ? (
                          <MenuActionLink href={`/api/jobs/${job.id}/invoice`} external icon="invoice" tone="accent">
                            Download Invoice
                          </MenuActionLink>
                        ) : canUseInvoices ? (
                          <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Invoice unavailable</span>
                        ) : null}
                        {canDelete && deleteAction ? (
                          <form action={deleteAction} className="border-t border-[var(--line)] px-3 py-2">
                            <input type="hidden" name="id" value={job.id} />
                            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />
                              </svg>
                              Delete Job
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </RowActionsMenu>
                  </div>
                ) : null}
              </div>
            );
          })}

        {/* Mobile footer */}
        <div className="border-t border-[var(--line)] px-4 py-3 text-center">
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No repairs found</p>
          ) : (
            <p className="text-[13px] text-[var(--ink-muted)]">
              {total != null ? `${total} repair${total !== 1 ? "s" : ""}` : `${jobs.length} shown`}
              {" · "}All caught up ✓
            </p>
          )}
        </div>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/50">
              {/* narrow strip col */}
              <th className="w-[3px] p-0" aria-hidden="true" />
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Job #</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Device</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Status</th>
              {canSeeClient ? <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Client</th> : null}
              {canSeeAssignment ? <th className="hidden px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] 2xl:table-cell">Assigned</th> : null}
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Received</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Age</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Flag</th>
              {canSeeCost ? <th className="hidden px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] 2xl:table-cell">{showClientFacingCostOnly ? "Cost" : "Ext. Bill"}</th> : null}
              <th className="px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {jobs.map((job) => {
              const strip = statusStripClass(job.status);
              const flagCfg = getJobListFlag(job, canManagePricing);
              const canDownloadQuotation = canUseQuotations && quotationStatuses.has(job.status);
              const canDownloadInvoice = canUseInvoices && invoiceStatuses.has(job.status);
              return (
                <tr
                  key={job.id}
                  className="group transition-colors hover:bg-[var(--panel-strong)]/40"
                >
                  {/* Status color strip */}
                  <td className="p-0 w-[3px]" aria-hidden="true">
                    <div className={`h-full min-h-[3rem] w-[3px] ${strip}`} />
                  </td>

                  {/* Job # */}
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="mono block font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                    >
                      {job.jobNumber}
                    </Link>
                  </td>

                  {/* Device */}
                  <td className="px-4 py-3 align-middle">
                    <p className="max-w-[16rem] truncate font-semibold text-[var(--ink)]">
                      {deviceName(job.brand, job.model) ?? (deviceLabel[job.deviceType] ?? job.deviceType)}
                    </p>
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-[var(--panel-strong)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--ink-muted)]">
                      <DeviceIcon type={job.deviceType} />
                      {deviceLabel[job.deviceType] ?? job.deviceType}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 align-middle">
                    <JobStatusBadge status={job.status} />
                  </td>

                  {/* Client */}
                  {canSeeClient ? (
                    <td className="px-4 py-3 align-middle">
                      <p className="max-w-[13rem] truncate text-[var(--ink)]">{job.clientName ?? <span className="text-[var(--ink-muted)]">—</span>}</p>
                    </td>
                  ) : null}

                  {/* Assigned (2xl) */}
                  {canSeeAssignment ? (
                    <td className="hidden px-4 py-3 align-middle 2xl:table-cell">
                      <p className="max-w-[11rem] truncate text-[var(--ink-muted)]">{job.assignedTo ?? "—"}</p>
                    </td>
                  ) : null}

                  {/* Received */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-[var(--ink-muted)]">
                    {formatEATDate(job.receivedAt)}
                  </td>

                  {/* Age */}
                  <td className="whitespace-nowrap px-4 py-3 align-middle">
                    <AgeBadge receivedAt={job.receivedAt} status={job.status} />
                  </td>

                  {/* Flag */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      {flagCfg && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${flagCfg.badge}`}>
                          {flagCfg.label}
                        </span>
                      )}
                      {!flagCfg && <span className="text-[var(--ink-muted)]">—</span>}
                    </div>
                  </td>

                  {/* Cost (2xl) */}
                  {canSeeCost ? (
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right align-middle 2xl:table-cell">
                      <span className="font-semibold text-[var(--ink)]">
                        {showClientFacingCostOnly
                          ? job.clientBill && ["READY_FOR_PICKUP", "COMPLETED", "CLOSED"].includes(job.status)
                            ? formatMoney(job.clientBill)
                            : <span className="font-normal text-[var(--ink-muted)]">—</span>
                          : job.externalTechBill
                            ? formatMoney(job.externalTechBill)
                            : <span className="font-normal text-[var(--ink-muted)]">—</span>}
                      </span>
                    </td>
                  ) : null}

                  {/* Actions */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 hover:text-[var(--accent)]"
                      >
                        Open
                      </Link>
                      <RowActionsMenu label={`More actions for ${job.jobNumber}`}>
                        <div className="py-1 text-left">
                          {canEditPage ? (
                            <MenuActionLink href={`/jobs/${job.id}/edit${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`} icon="edit">
                              Edit Job
                            </MenuActionLink>
                          ) : null}
                          {canUseJobCards ? (
                            <MenuActionLink href={`/api/jobs/${job.id}/job-card`} external icon="job" tone="accent">
                              Download Job Card
                            </MenuActionLink>
                          ) : null}
                          {canDownloadQuotation ? (
                            <MenuActionLink href={`/api/jobs/${job.id}/quotation`} external icon="quote" tone="accent">
                              Download Quotation
                            </MenuActionLink>
                          ) : (
                            canUseQuotations ? <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Quotation unavailable</span> : null
                          )}
                          {canDownloadInvoice ? (
                            <MenuActionLink href={`/api/jobs/${job.id}/invoice`} external icon="invoice" tone="accent">
                              Download Invoice
                            </MenuActionLink>
                          ) : (
                            canUseInvoices ? <span className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)]">Invoice unavailable</span> : null
                          )}
                          {canDelete && deleteAction ? (
                            <form action={deleteAction} className="border-t border-[var(--line)] px-3 py-2">
                              <input type="hidden" name="id" value={job.id} />
                              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 hover:text-red-700">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />
                                </svg>
                                Delete Job
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </RowActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
