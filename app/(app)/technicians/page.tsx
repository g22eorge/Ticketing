import { Fragment } from "react";
import Link from "next/link";


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

  // Per-tech workload (admin/ops visibility)
  const isAdmin = user.role === "ADMIN" || user.role === "OPS";
  const techWorkloadMap = new Map<string, { name: string; active: number; inRepair: number; awaiting: number; overdue: number; ready: number }>();
  if (isAdmin) {
    for (const job of normalized) {
      const techName = job.assignedTo?.name ?? "Unassigned";
      const key = techName;
      if (!techWorkloadMap.has(key)) techWorkloadMap.set(key, { name: techName, active: 0, inRepair: 0, awaiting: 0, overdue: 0, ready: 0 });
      const entry = techWorkloadMap.get(key)!;
      entry.active++;
      if (job.status === "IN_REPAIR") entry.inRepair++;
      if (job.status === "AWAITING_APPROVAL") entry.awaiting++;
      if (job.overdue) entry.overdue++;
      if (job.ready) entry.ready++;
    }
  }
  const techWorkload = Array.from(techWorkloadMap.values()).sort((a, b) => b.active - a.active);
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
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Workbench</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Technicians</p>
            <p className="text-[13px] text-[var(--ink-muted)]">Active assignments and repair board</p>
          </div>
          <Link href="/settings/users" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-[12px]">Manage staff →</Link>
        </div>
      </div>

      {/* ── Technician KPI tiles ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Technicians</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ink)]">{totalTechs}</p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{internalCount} internal · {externalCount} external</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Active Jobs</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ink)]">{assignedCount}</p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">in the queue now</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Ready to Complete</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${readyCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--ink)]"}`}>{readyCount}</p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">approved, awaiting handover</p>
        </div>
        <div className={`panel-shadow rounded-xl border px-3 py-2.5 ${overdueCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-[var(--line)] bg-[var(--panel)]"}`}>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Overdue</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${overdueCount > 0 ? "text-red-500" : "text-[var(--ink)]"}`}>{overdueCount}</p>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{assignedThisMonth} assigned this month</p>
        </div>
      </div>

      {/* ── Per-tech workload (admin/ops only) ── */}
      {isAdmin && techWorkload.length > 0 && (
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Technician Workload</p>
            <Link href="/settings/users" className="text-[12px] font-semibold text-[var(--accent)] hover:underline">Manage →</Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {techWorkload.map((tech) => (
              <div key={tech.name} className="flex items-center gap-4 px-4 py-3">
                {/* Avatar */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-black ${tech.overdue > 0 ? "bg-red-500/10 text-red-500" : tech.ready > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                  {tech.name[0]?.toUpperCase() ?? "?"}
                </div>
                {/* Name + load bar */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-[var(--ink)]">{tech.name}</p>
                    <p className="text-[12px] font-bold text-[var(--ink)]">{tech.active} active</p>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {/* Load bar */}
                    <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-strong)]">
                      {tech.inRepair > 0 && <div className="h-full bg-sky-500" style={{ width: `${Math.round((tech.inRepair / tech.active) * 100)}%` }} />}
                      {tech.awaiting > 0 && <div className="h-full bg-amber-500" style={{ width: `${Math.round((tech.awaiting / tech.active) * 100)}%` }} />}
                      {tech.ready > 0 && <div className="h-full bg-emerald-500" style={{ width: `${Math.round((tech.ready / tech.active) * 100)}%` }} />}
                    </div>
                  </div>
                </div>
                {/* Status badges */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {tech.inRepair > 0 && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">{tech.inRepair} repair</span>}
                  {tech.awaiting > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{tech.awaiting} approval</span>}
                  {tech.ready > 0 && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{tech.ready} ready</span>}
                  {tech.overdue > 0 && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500">{tech.overdue} overdue</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
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
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
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
        {/* Search + quick chips + action — single compact row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-3 py-2">
          <form className="flex min-w-0 flex-1 gap-1.5">
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search job # or device…"
              className="h-8 flex-1 min-w-[140px] rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
            />
            <button type="submit" className="h-8 rounded-lg border border-[var(--line)] px-3 text-[12px] font-medium hover:bg-[var(--panel-strong)]">Search</button>
            {filters.q && <Link href="/technicians" className="flex h-8 items-center rounded-lg border border-[var(--line)] px-3 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Clear</Link>}
          </form>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${action.active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/30"}`}
              >
                {action.label} <span className={action.active ? "opacity-80" : "text-[var(--ink-muted)]"}>({action.count})</span>
              </Link>
            ))}
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
          <Link href="/jobs" className="text-[13px] font-semibold text-[var(--accent)] hover:underline">All Jobs →</Link>
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
                            <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${job.priority.tone}`}>
                              {job.priority.label}
                            </span>
                          </div>
                          <p className="font-medium text-[var(--ink)]">{deviceName(job.brand, job.model) ?? deviceLabel[job.deviceType as keyof typeof deviceLabel] ?? job.deviceType}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--ink-muted)]">
                            <span>{job.assignedTo?.name ?? "Unassigned"}</span>
                            <span>{formatEATDate(job.receivedAt)}</span>
                            <span>{job.ageDays}d old</span>
                            {job.repairTimeline ? <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">ETA {job.repairTimeline}</span> : null}
                            {job.overdue ? <span className="rounded-full bg-black px-2 py-0.5 text-white text-[12px]">Overdue</span> : null}
                          </div>
                          {typeof job.etaProgress === "number" ? (
                            <div className="h-1 rounded-full bg-[var(--line)]">
                              <div className={`h-1 rounded-full ${job.etaProgress >= 100 ? "bg-[var(--accent)]" : "bg-[var(--ink)]"}`} style={{ width: `${Math.min(job.etaProgress, 100)}%` }} />
                            </div>
                          ) : null}
                          {job.timelineNote ? (
                            <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[13px] text-amber-700 dark:text-amber-400">
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
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Job #</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Device</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Status</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Assigned</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Received</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Age / ETA</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Priority</th>
                    <th className="px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">Actions</th>
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
                              <p className="text-[13px] text-[var(--accent)]">ETA {job.repairTimeline}</p>
                            ) : null}
                            {typeof job.etaProgress === "number" ? (
                              <div className="mt-1 h-1 w-20 rounded-full bg-[var(--line)]">
                                <div className={`h-1 rounded-full ${job.etaProgress >= 100 ? "bg-[var(--accent)]" : "bg-[var(--ink)]"}`} style={{ width: `${Math.min(job.etaProgress, 100)}%` }} />
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-semibold ${job.priority.tone}`}>
                              {job.priority.label}
                            </span>
                            {job.overdue ? (
                              <span className="ml-1 inline-flex rounded-full bg-black px-2 py-0.5 text-[12px] font-semibold text-white">Overdue</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                                className="whitespace-nowrap rounded-md border border-[var(--line)] px-2.5 py-1 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 hover:text-[var(--accent)]"
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
