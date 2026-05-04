import Link from "next/link";
import { Role } from "@prisma/client";

function deviceName(brand?: string | null, model?: string | null) {
  const b = brand && brand !== "Unknown" ? brand : "";
  const m = model && model !== "Unknown" ? model : "";
  return [b, m].filter(Boolean).join(" ") || null;
}

import { ProgressiveList } from "@/components/mobile/ProgressiveList";
import { JobStatusBadge, statusStripClass } from "@/components/jobs/JobStatusBadge";
import { formatMoney } from "@/lib/currency";
import { formatEATDate } from "@/lib/date-eat";
import { JobStatus } from "@/lib/job-status";
import { can } from "@/lib/permissions";

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
  externalTechBill?: number | null;
  clientBill?: number | null;
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
  PARTS_PENDING:        { badge: "bg-amber-50 text-amber-600 border border-amber-200",   label: "Parts pending" },
  SPECIALIST_ESCALATION:{ badge: "bg-violet-50 text-violet-700 border border-violet-200", label: "Escalated" },
  CLIENT_DECLINED:      { badge: "bg-red-50 text-red-600 border border-red-200",          label: "Declined" },
  UNREPAIRABLE:         { badge: "bg-red-50 text-red-600 border border-red-200",          label: "Unrepairable" },
  CUSTOMER_CANCELLED:   { badge: "bg-gray-50 text-gray-500 border border-gray-200",       label: "Cancelled" },
  OTHER:                { badge: "bg-gray-50 text-gray-600 border border-gray-200",       label: "Other" },
};

const deviceLabel: Record<string, string> = {
  PHONE_ANDROID: "Android",
  PHONE_IPHONE:  "iPhone",
  TABLET:        "Tablet",
  WINDOWS_PC:    "Windows",
  MAC:           "Mac",
  OTHER:         "Other",
};

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
  const showClientFacingCostOnly =
    (can.viewApprovedCost(permissionUser) || canManagePricing)
    && !can.reviewExternalBills(permissionUser);

  const hasPagination = typeof total === "number" && typeof page === "number" && typeof totalPages === "number";

  const paginationBar = hasPagination && (totalPages ?? 0) > 1 ? (
    <div className="flex items-center gap-1.5">
      {isPrevDisabled || !prevPageHref ? (
        <span className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium opacity-30 text-[var(--ink-muted)]">
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
        <span className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium opacity-30 text-[var(--ink-muted)]">
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

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
        <p className="text-[11px] text-[var(--ink-muted)]">
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

      {/* ── Mobile list ── */}
      <div className="lg:hidden">
        <ProgressiveList initialCount={5} step={6}>
          {jobs.map((job) => {
            const strip = statusStripClass(job.status);
            const hasFlag = job.workflowReason && job.workflowReason !== "NONE";
            const flagCfg = hasFlag ? workflowReasonConfig[job.workflowReason as HighlightReason] : null;

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

            // Pricing badge (admin/ops only)
            const pricingBadge = canManagePricing
              ? typeof job.clientBill === "number"
                ? <span key="priced" className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--accent)]/10 text-[#9A7A00]">Priced</span>
                : ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)
                  ? <span key="needs" className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600">Needs pricing</span>
                  : null
              : null;

            return (
              <div
                key={job.id}
                className="relative border-b border-[var(--line)]/70 bg-[var(--panel)] last:border-b-0 transition-colors hover:bg-[var(--panel-strong)]/40"
              >
                {/* Status strip — 5px for clear visual weight */}
                <span className={`absolute inset-y-0 left-0 w-[5px] ${strip}`} aria-hidden="true" />

                {/* Full-bleed tap target */}
                <Link
                  href={`/jobs/${job.id}`}
                  className="absolute inset-0 z-0"
                  aria-label={`Open job ${job.jobNumber}`}
                />

                {/* Card content — pointer-events-none so taps fall through to link */}
                <div className="pointer-events-none relative z-10 px-4 py-3 pl-6">

                  {/* Row 1: Job # (muted reference) + secondary actions / tap cue */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="mono text-[10px] font-medium tracking-wide text-[var(--ink-muted)]/50">
                      {job.jobNumber}
                    </span>
                    {(canEditPage || (canDelete && deleteAction)) ? (
                      <div className="pointer-events-auto flex items-center gap-3">
                        {canEditPage ? (
                          <Link
                            href={`/jobs/${job.id}/edit${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                            className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-muted)]/60 transition hover:text-[var(--ink-muted)]"
                          >
                            Edit
                          </Link>
                        ) : null}
                        {canDelete && deleteAction ? (
                          <form action={deleteAction}>
                            <input type="hidden" name="id" value={job.id} />
                            <button className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-muted)]/50 transition hover:text-red-500">
                              ✕
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      /* Tap affordance */
                      <svg viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-1.5 shrink-0 text-[var(--ink-muted)]/25" aria-hidden="true">
                        <path d="M1 1l4 4-4 4"/>
                      </svg>
                    )}
                  </div>

                  {/* Row 2: Device — the HERO element */}
                  <p className="mb-1.5 truncate text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">
                    {deviceName(job.brand, job.model) ?? (deviceLabel[job.deviceType] ?? job.deviceType)}
                  </p>

                  {/* Row 3: Status + device type chip + flag */}
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <JobStatusBadge status={job.status} />
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--panel-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                      <DeviceIcon type={job.deviceType} />
                      {deviceLabel[job.deviceType] ?? job.deviceType}
                    </span>
                    {flagCfg ? (
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${flagCfg.badge}`}>
                        {flagCfg.label}
                      </span>
                    ) : null}
                  </div>

                  {/* Row 4: Meta footer — client · date · tech | cost */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                      {canSeeClient && job.clientName ? (
                        <span className="min-w-0 truncate">{job.clientName}</span>
                      ) : null}
                      {canSeeClient && job.clientName ? (
                        <span className="shrink-0 opacity-40">·</span>
                      ) : null}
                      <span className="shrink-0">{formatEATDate(job.receivedAt)}</span>
                      {canSeeAssignment && job.assignedTo ? (
                        <>
                          <span className="shrink-0 opacity-40">·</span>
                          <span className="max-w-[5rem] truncate">{job.assignedTo}</span>
                        </>
                      ) : null}
                    </div>
                    {costValue ? (
                      <span className="shrink-0 text-[13px] font-bold text-[var(--ink)]">{costValue}</span>
                    ) : null}
                  </div>

                  {/* Row 5: Pricing badge — own line so it never crushes the footer */}
                  {pricingBadge ? (
                    <div className="mt-1.5">{pricingBadge}</div>
                  ) : null}

                </div>
              </div>
            );
          })}
        </ProgressiveList>

        {/* Mobile pagination */}
        {hasPagination && (totalPages ?? 0) > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3">
            <span className="text-xs text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--ink)]">{pageStart}–{pageEnd}</span> of {total}
            </span>
            {paginationBar}
          </div>
        ) : null}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/50">
              {/* narrow strip col */}
              <th className="w-[3px] p-0" aria-hidden="true" />
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Job #</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Device</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Status</th>
              {canSeeClient ? <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Client</th> : null}
              {canSeeAssignment ? <th className="hidden px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] 2xl:table-cell">Assigned</th> : null}
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Received</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Flag</th>
              {canSeeCost ? <th className="hidden px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)] 2xl:table-cell">{showClientFacingCostOnly ? "Cost" : "Ext. Bill"}</th> : null}
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {jobs.map((job) => {
              const strip = statusStripClass(job.status);
              const hasFlag = job.workflowReason && job.workflowReason !== "NONE";
              const flagCfg = hasFlag ? workflowReasonConfig[job.workflowReason as HighlightReason] : null;
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
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-[var(--panel-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
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

                  {/* Flag */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-1">
                      {flagCfg && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${flagCfg.badge}`}>
                          {flagCfg.label}
                        </span>
                      )}
                      {canManagePricing && (
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          typeof job.clientBill === "number"
                            ? "bg-[var(--accent)]/10 text-[#9A7A00]"
                            : ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)
                              ? "bg-amber-50 text-amber-600"
                              : "hidden"
                        }`}>
                          {typeof job.clientBill === "number"
                            ? "Priced"
                            : ["AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)
                              ? "Needs pricing"
                              : null}
                        </span>
                      )}
                      {!flagCfg && !canManagePricing && <span className="text-[var(--ink-muted)]">—</span>}
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
                        className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 hover:text-[var(--accent)]"
                      >
                        Open
                      </Link>
                      {canEditPage ? (
                        <Link
                          href={`/jobs/${job.id}/edit${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
                          className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-muted)] transition-colors hover:border-[var(--ink)]/20 hover:text-[var(--ink)]"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {canDelete && deleteAction ? (
                        <form action={deleteAction} className="inline">
                          <input type="hidden" name="id" value={job.id} />
                          <button className="whitespace-nowrap rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600">
                            Delete
                          </button>
                        </form>
                      ) : null}
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
