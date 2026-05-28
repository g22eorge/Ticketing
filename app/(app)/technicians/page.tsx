import { Fragment } from "react";
import Link from "next/link";


import { StickyKpiRow } from "@/components/mobile/StickyKpiRow";
import { JobStatusBadge, statusStripClass } from "@/components/jobs/JobStatusBadge";
import { JOB_STATUSES, UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { formatEATDate } from "@/lib/date-eat";
import { prisma } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";
import { Role } from "@prisma/client";

function deviceName(brand?: string | null, model?: string | null) {
  const b = brand && brand !== "Unknown" ? brand : "";
  const m = model && model !== "Unknown" ? model : "";
  return [b, m].filter(Boolean).join(" ") || null;
}

const deviceLabel: Record<string, string> = {
  PHONE_ANDROID: "Android",
  PHONE_IPHONE: "iPhone",
  TABLET: "Tablet",
  WINDOWS_PC: "Windows",
  MAC: "Mac",
  OTHER: "Other",
};


type SearchParams = {
  q?: string;
  status?: string;
  ready?: string;
  dismiss?: string;
};

const ACTIVE_BOARD_STATUSES = [
  "RECEIVED",
  "DIAGNOSING",
  "REFERRED",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "READY_FOR_PICKUP",
];

const statusOptionLabel: Record<ReturnType<typeof normalizeJobStatus>, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function priorityBand(overdue: boolean, ready: boolean, ageDays: number) {
  if (overdue) return { label: "Attention", tone: "bg-[#0b0b0b] text-white/90 border-white/10" };
  if (ready) return { label: "High", tone: "bg-[var(--accent)] text-white border-[var(--accent)]" };
  if (ageDays >= 2) return { label: "Medium", tone: "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30" };
  return { label: "Normal", tone: "bg-[var(--panel-strong)] text-[var(--ink)] border-[var(--line)]" };
}

function shortText(value: string | null, max = 78) {
  if (!value) return "No issue summary provided";
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
}

export default async function TechniciansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await getCurrentUserRole();
  const filters = await searchParams;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalTechs, internalCount, externalCount, assignedThisMonth] = await Promise.all([
    prisma.user.count({ where: { role: { in: ["TECHNICIAN_INTERNAL", "TECHNICIAN_EXTERNAL"] } } }).catch(() => 0),
    prisma.user.count({ where: { role: "TECHNICIAN_INTERNAL" } }).catch(() => 0),
    prisma.user.count({ where: { role: "TECHNICIAN_EXTERNAL" } }).catch(() => 0),
    prisma.job.count({ where: { assignedToId: { not: null }, receivedAt: { gte: monthStart } } }).catch(() => 0),
  ]);

  const validStatuses = new Set<string>(JOB_STATUSES);
  const statusFilter = filters.status && validStatuses.has(filters.status as JobStatus)
    ? (filters.status as JobStatus)
    : undefined;

  function routeWith(next: Partial<Record<keyof SearchParams, string>>) {
    const params = new URLSearchParams();
    const entries: Array<[keyof SearchParams, string | undefined]> = [
      ["q", filters.q],
      ["status", filters.status],
      ["ready", filters.ready],
      ["dismiss", filters.dismiss],
    ];
    for (const [key, value] of entries) {
      const update = next[key];
      const finalValue = update !== undefined ? update : value;
      if (finalValue && finalValue.trim().length > 0) {
        params.set(key, finalValue);
      }
    }
    const query = params.toString();
    return query ? `/technicians?${query}` : "/technicians";
  }

  const where =
    user.role === "TECHNICIAN_EXTERNAL" || user.role === "TECHNICIAN_INTERNAL"
      ? { assignedToId: user.id }
      : {
          // Operations users need a board view across *all* technicians,
          // not just externally-referred jobs.
          assignedTo: {
            is: {
              role: { in: [Role.TECHNICIAN_EXTERNAL, Role.TECHNICIAN_INTERNAL] },
            },
          },
        };

  const jobs = await prisma.job.findMany({
    where: {
      ...where,
      ...(filters.q
        ? {
            OR: [
              { jobNumber: { contains: filters.q } },
              { brand: { contains: filters.q } },
              { model: { contains: filters.q } },
            ],
          }
        : {}),
    },
    orderBy: { receivedAt: "desc" },
    include: {
      assignedTo: { select: { name: true } },
    },
  });

  const normalized = jobs
    .filter((job) => {
      if (statusFilter && job.status !== statusFilter) return false;
      if (!statusFilter && !ACTIVE_BOARD_STATUSES.includes(job.status)) return false;
      if (filters.ready === "1" && !(job.status === "IN_REPAIR" && job.clientApproved === true)) return false;
      return true;
    })
    .map((job) => {
    const extendedJob = job as typeof job & { timelineNote?: string | null };
    const ageDays = Math.floor((job.updatedAt.getTime() - job.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedMinutes = Math.max(0, Math.floor((job.updatedAt.getTime() - job.receivedAt.getTime()) / (1000 * 60)));
    const etaMinutes = job.timelineMaxMinutes ?? job.timelineMinMinutes ?? null;
    const etaProgress = etaMinutes ? clamp((elapsedMinutes / etaMinutes) * 100, 0, 180) : null;
    const ready = job.status === "IN_REPAIR" && job.clientApproved === true;
    const overdue = ready && ageDays >= 3;
    const priority = priorityBand(overdue, ready, ageDays);
    return {
      ...job,
      ageDays,
      ready,
      overdue,
      etaProgress,
      elapsedMinutes,
      priority,
      timelineNote: extendedJob.timelineNote ?? null,
    };
    });

  const sortedJobs = [...normalized].sort((a, b) => {
    if (a.ready !== b.ready) return Number(b.ready) - Number(a.ready);
    if (a.overdue !== b.overdue) return Number(b.overdue) - Number(a.overdue);
    return b.ageDays - a.ageDays;
  });

  const assignedCount = normalized.length;
  const readyCount = normalized.filter((job) => job.ready).length;
  const inRepairCount = normalized.filter((job) => job.status === "IN_REPAIR").length;
  const overdueCount = normalized.filter((job) => job.overdue).length;
  const awaitingApprovalCount = normalized.filter((job) => job.status === "AWAITING_APPROVAL").length;
  const dismissedSpotlightIds = new Set(
    (filters.dismiss ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const spotlightJobs = sortedJobs
    .filter(
      (job) =>
        !dismissedSpotlightIds.has(job.id) &&
        ["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status),
    )
    .slice(0, 3);
  const spotlightJobIds = new Set(spotlightJobs.map((j) => j.id));
  function dismissSpotlightReturnTo(jobId: string) {
    const merged = new Set([...dismissedSpotlightIds, jobId]);
    return routeWith({ dismiss: Array.from(merged).join(",") });
  }
  const boardReturnTo = routeWith({});
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.ready);
  const quickActions = [
    { href: routeWith({ ready: "1", status: "" }), label: "Ready", count: readyCount, active: filters.ready === "1" },
    { href: routeWith({ status: "IN_REPAIR", ready: "" }), label: "In Repair", count: inRepairCount, active: filters.status === "IN_REPAIR" && filters.ready !== "1" },
    { href: routeWith({ status: "AWAITING_APPROVAL", ready: "" }), label: "Approval", count: awaitingApprovalCount, active: filters.status === "AWAITING_APPROVAL" },
  ];
  return (
    <div className="space-y-4">

      {/* ── Page header ── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Workbench</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Technicians</p>
            <p className="text-[11px] text-[var(--ink-muted)]">Active assignments and repair board</p>
          </div>
          <Link href="/settings/users" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[12px]">Manage staff →</Link>
        </div>
      </div>

      {/* ── Technician KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Technicians</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{totalTechs}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">internal + external</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Internal</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{internalCount}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">in-house staff</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">External</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{externalCount}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">contractors</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Jobs Assigned This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{assignedThisMonth}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">this month</p>
        </div>
      </div>

      {/* KPI Row */}
      <StickyKpiRow
        items={[
          { label: "Assigned", value: String(assignedCount), href: "/technicians", tone: "default" },
          { label: "Ready", value: String(readyCount), href: "/technicians?ready=1", tone: readyCount > 0 ? "brand" : "default" },
          { label: "In Repair", value: String(inRepairCount), href: "/technicians?status=IN_REPAIR", tone: "default" },
          { label: "Overdue", value: String(overdueCount), tone: overdueCount > 0 ? "warning" : "default" },
        ]}
        className="lg:grid-cols-4"
      />

      {/* Filter + Quick Actions — unified panel */}
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {(() => {
          function statusHref(nextStatus: string) {
            const params = new URLSearchParams();
            const q = (filters.q ?? "").trim();
            const ready = (filters.ready ?? "").trim();
            if (q) params.set("q", q);
            if (ready) params.set("ready", ready);
            if (nextStatus) params.set("status", nextStatus);
            const query = params.toString();
            return query ? `/technicians?${query}` : "/technicians";
          }

          const activeStatus = filters.status && (UI_JOB_STATUSES as readonly string[]).includes(filters.status)
            ? filters.status
            : "";

          return (
            <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/35 px-3 py-2">
              <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                <Link
                  href={statusHref("")}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    activeStatus
                      ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                      : "border-[var(--accent)] bg-[var(--accent)] text-white"
                  }`}
                >
                  All
                </Link>
                {UI_JOB_STATUSES.map((status) => {
                  const active = activeStatus === status;
                  return (
                    <Link
                      key={status}
                      href={statusHref(status)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                      }`}
                    >
                      {statusOptionLabel[status]}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* Auto-hide search after applying */}
        <details className="group border-b border-[var(--line)]" open={!filters.q}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]/30 [&::-webkit-details-marker]:hidden">
            <span className="truncate">
              Search
              {filters.q ? (
                <span className="ml-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
                  {filters.q}
                </span>
              ) : null}
            </span>
            <span className="text-[var(--accent)] group-open:hidden">Show</span>
            <span className="hidden text-[var(--accent)] group-open:inline">Hide</span>
          </summary>
          <form>
            <div className="space-y-2 px-3 pb-3">
              <input
                name="q"
                defaultValue={filters.q}
                placeholder="Search job # or device"
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <div className="flex items-center gap-2">
                <button className="btn-premium-secondary shrink-0 rounded-lg px-3 py-2.5 text-sm">Apply</button>
                <Link href="/technicians" className="btn-premium-secondary shrink-0 rounded-lg px-3 py-2.5 text-sm">Reset</Link>
              </div>
            </div>
          </form>
        </details>

        {/* Quick filter chips + secondary action */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${action.active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/30"}`}
              >
                {action.label} <span className={action.active ? "opacity-80" : "text-[var(--ink-muted)]"}>({action.count})</span>
              </Link>
            ))}
            {hasActiveFilters ? (
              <Link href="/technicians" className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[11px] font-semibold text-[var(--ink-muted)] hover:border-red-400/30 hover:text-red-600 dark:hover:text-red-400">
                Clear filters
              </Link>
            ) : null}
          </div>
          <Link
            href={user.role === "TECHNICIAN_EXTERNAL" ? "/technicians/payouts" : `/jobs?status=IN_REPAIR&returnTo=${encodeURIComponent(boardReturnTo)}`}
            className="btn-premium-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs"
          >
            {user.role === "TECHNICIAN_EXTERNAL" ? "My Payouts →" : "Timeline Notes →"}
          </Link>
        </div>
      </section>


      {/* Work Queue */}
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-xs text-[var(--ink-muted)]">
            <span className="font-bold text-[var(--ink)]">{sortedJobs.length}</span> jobs
          </p>
          <Link href="/jobs" className="text-[11px] font-semibold text-[var(--accent)] hover:underline">All Jobs →</Link>
        </div>

        {sortedJobs.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
            No jobs in this queue. Try changing filters.
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="lg:hidden">
                {sortedJobs.map((job) => {
                  const strip = statusStripClass(job.status);
                  const isSpotlight = spotlightJobIds.has(job.id);
                  return (
                    <div
                      key={job.id}
                      className={`relative border-b border-[var(--line)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--panel-strong)]/30 ${isSpotlight ? "bg-[var(--accent)]/[0.04]" : "bg-[var(--panel)]"}`}
                    >
                      <span className={`absolute inset-y-0 left-0 w-[3px] rounded-r ${isSpotlight ? "bg-[var(--accent)]" : strip}`} aria-hidden="true" />
                      <div className="flex items-start justify-between gap-3 pl-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isSpotlight && <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-label="Priority" role="img"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                            <Link href={`/jobs/${job.id}`} className="mono text-[13px] font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]">{job.jobNumber}</Link>
                            <JobStatusBadge status={job.status} />
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${job.priority.tone}`}>
                              {job.priority.label}
                            </span>
                          </div>
                          <p className="font-medium text-[var(--ink)]">{deviceName(job.brand, job.model) ?? deviceLabel[job.deviceType as keyof typeof deviceLabel] ?? job.deviceType}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--ink-muted)]">
                            <span>{job.assignedTo?.name ?? "Unassigned"}</span>
                            <span>{formatEATDate(job.receivedAt)}</span>
                            <span>{job.ageDays}d old</span>
                            {job.repairTimeline ? <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">ETA {job.repairTimeline}</span> : null}
                            {job.overdue ? <span className="rounded-full bg-black px-2 py-0.5 text-white text-[10px]">Overdue</span> : null}
                          </div>
                          {typeof job.etaProgress === "number" ? (
                            <div className="h-1 rounded-full bg-[var(--line)]">
                              <div className={`h-1 rounded-full ${job.etaProgress >= 100 ? "bg-[var(--accent)]" : "bg-[var(--ink)]"}`} style={{ width: `${Math.min(job.etaProgress, 100)}%` }} />
                            </div>
                          ) : null}
                          {job.timelineNote ? (
                            <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                              Delay: {shortText(job.timelineNote, 88)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                          <Link
                            href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                            className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-[13px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/6 hover:text-[var(--accent)]"
                          >
                            Open
                          </Link>
                          {job.status === "IN_REPAIR" || job.status === "READY_FOR_PICKUP" ? (
                            <Link
                              href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                              className="btn-premium inline-flex min-h-[44px] items-center rounded-xl px-4 py-2 text-[13px] font-bold text-white"
                            >
                              Complete
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[800px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--panel-strong)]/50">
                    <th className="w-[3px] p-0" aria-hidden="true" />
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Job #</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Device</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Assigned</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Received</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Age / ETA</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Priority</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                    {sortedJobs.map((job, idx) => {
                      const strip = statusStripClass(job.status);
                      const isSpotlight = spotlightJobIds.has(job.id);
                      const isFirstNonSpotlight = !isSpotlight && idx > 0 && spotlightJobIds.has(sortedJobs[idx - 1].id);
                      return (
                        <Fragment key={job.id}>
                          {isFirstNonSpotlight && (
                            <tr aria-hidden="true">
                              <td colSpan={9} className="py-0">
                                <div className="mx-4 border-t-2 border-dashed border-[var(--accent)]/20" />
                              </td>
                            </tr>
                          )}
                          <tr className={`group transition-colors hover:bg-[var(--panel-strong)]/40 ${isSpotlight ? "bg-[var(--accent)]/[0.04]" : ""}`}>
                            <td className="p-0 w-[3px]" aria-hidden="true">
                              <div className={`h-full min-h-[3rem] w-[3px] ${isSpotlight ? "bg-[var(--accent)]" : strip}`} />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="flex items-center gap-1.5">
                                {isSpotlight && <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-label="Priority" role="img"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                                <Link
                                  href={`/jobs/${job.id}?returnTo=${encodeURIComponent(dismissSpotlightReturnTo(job.id))}`}
                                  className="mono block font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                                >
                                  {job.jobNumber}
                                </Link>
                              </div>
                            </td>
                          <td className="px-4 py-3 align-middle">
                            <p className="max-w-[16rem] truncate font-semibold text-[var(--ink)]">{deviceName(job.brand, job.model) ?? deviceLabel[job.deviceType as keyof typeof deviceLabel] ?? job.deviceType}</p>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <JobStatusBadge status={job.status} />
                          </td>
                          <td className="px-4 py-3 align-middle text-[var(--ink-muted)]">
                            {job.assignedTo?.name ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 align-middle text-[var(--ink-muted)]">
                            {formatEATDate(job.receivedAt)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <p className="text-[var(--ink-muted)]">{job.ageDays}d old</p>
                            {job.repairTimeline ? (
                              <p className="text-[11px] text-[var(--accent)]">ETA {job.repairTimeline}</p>
                            ) : null}
                            {typeof job.etaProgress === "number" ? (
                              <div className="mt-1 h-1 w-20 rounded-full bg-[var(--line)]">
                                <div className={`h-1 rounded-full ${job.etaProgress >= 100 ? "bg-[var(--accent)]" : "bg-[var(--ink)]"}`} style={{ width: `${Math.min(job.etaProgress, 100)}%` }} />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${job.priority.tone}`}>
                              {job.priority.label}
                            </span>
                            {job.overdue ? (
                              <span className="ml-1 inline-flex rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">Overdue</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                                className="whitespace-nowrap rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 hover:text-[var(--accent)]"
                              >
                                Open
                              </Link>
                              {job.status === "IN_REPAIR" || job.status === "READY_FOR_PICKUP" ? (
                                <Link
                                  href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                                  className="btn-premium whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                                >
                                  Complete
                                </Link>
                              ) : null}
                            </div>
                          </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
