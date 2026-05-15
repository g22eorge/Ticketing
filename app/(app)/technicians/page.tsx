import Link from "next/link";

import { SearchToggle } from "@/components/shared/SearchToggle";
import { JobStatusBadge, statusStripClass } from "@/components/jobs/JobStatusBadge";
import { JOB_STATUSES, UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { formatEATDate } from "@/lib/date-eat";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
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

function nextCourse(job: {
  status: JobStatus;
  ready: boolean;
  clientApproved: boolean | null;
  repairPath: "IN_HOUSE" | "EXTERNAL" | null;
}) {
  if (job.status === "RECEIVED") return "Start diagnosis and capture baseline findings.";
  if (job.status === "DIAGNOSING") {
    return job.repairPath === "EXTERNAL"
      ? "Prepare referral notes and submit external handoff."
      : "Finalize diagnosis and move job to internal repair.";
  }
  if (job.status === "AWAITING_APPROVAL") return "Await client approval before active repair work.";
  if (job.status === "IN_REPAIR") {
    if (job.ready) return "Run final checks and prepare pickup handoff.";
    return job.clientApproved ? "Continue repair and keep timeline updated." : "Pause work until approval is confirmed.";
  }
  if (job.status === "READY_FOR_PICKUP") return "Notify client and complete pickup checklist.";
  if (job.status === "COMPLETED") return "Close documentation and archive supporting notes.";
  return "No pending action for this job.";
}

export default async function TechniciansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, user, orgId } = await requireOrgSession();
  const filters = await searchParams;
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
      ? { assignedToId: session.user.id }
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
      orgId,
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
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const spotlightCandidates = sortedJobs.filter(
    (job) =>
      !dismissedSpotlightIds.has(job.id) &&
      ["RECEIVED", "DIAGNOSING", "REFERRED", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status),
  );
  const spotlightJobs = spotlightCandidates.slice(0, 3);
  const boardReturnTo = routeWith({});
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.ready);
  const quickActions = [
    { href: routeWith({ ready: "1", status: "" }), label: "Ready", count: readyCount, active: filters.ready === "1" },
    { href: routeWith({ status: "IN_REPAIR", ready: "" }), label: "In Repair", count: inRepairCount, active: filters.status === "IN_REPAIR" && filters.ready !== "1" },
    { href: routeWith({ status: "AWAITING_APPROVAL", ready: "" }), label: "Approval", count: awaitingApprovalCount, active: filters.status === "AWAITING_APPROVAL" },
  ];
  function dismissSpotlightReturnTo(jobId: string) {
    const merged = new Set([...dismissedSpotlightIds, jobId]);
    return routeWith({ dismiss: Array.from(merged).join(",") });
  }

  return (
    <div className="space-y-4">
      {/* ── Header strip: title · inline KPIs · action ── */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        {/* Title + KPI pills */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-[13px] font-bold text-[var(--ink)]">Tech Board</p>
          <span className="h-3.5 w-px bg-[var(--line)]" aria-hidden="true" />
          <Link href="/technicians" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Assigned <span className="font-bold text-[var(--ink)]">{assignedCount}</span>
          </Link>
          <Link href="/technicians?ready=1" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
            Ready <span className={`font-bold ${readyCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>{readyCount}</span>
          </Link>
          <Link href="/technicians?status=IN_REPAIR" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
            In Repair <span className="font-bold text-[var(--ink)]">{inRepairCount}</span>
          </Link>
          <span className="text-[11px] text-[var(--ink-muted)]">
            Overdue <span className={`font-bold ${overdueCount > 0 ? "text-amber-500" : "text-[var(--ink)]"}`}>{overdueCount}</span>
          </span>
        </div>
        {/* Action */}
        <Link
          href={user.role === "TECHNICIAN_EXTERNAL" ? "/technicians/payouts" : `/jobs?status=IN_REPAIR&returnTo=${encodeURIComponent(boardReturnTo)}`}
          className="btn-premium-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs"
        >
          {user.role === "TECHNICIAN_EXTERNAL" ? "My Payouts →" : "Timeline Notes →"}
        </Link>
      </div>

      {/* ── Filter strip: status pills · quick chips · search ── */}
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
            <>
              {/* Status pills row */}
              <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  <Link
                    href={statusHref("")}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                      activeStatus ? "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30" : "border-[var(--accent)] bg-[var(--accent)] text-white"
                    }`}
                  >
                    All
                  </Link>
                  {UI_JOB_STATUSES.map((status) => (
                    <Link
                      key={status}
                      href={statusHref(status)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                        activeStatus === status ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink-muted)] hover:border-[var(--accent)]/30"
                      }`}
                    >
                      {statusOptionLabel[status]}
                    </Link>
                  ))}
                </div>
                <SearchToggle
                  basePath="/technicians"
                  defaultValue={filters.q}
                  placeholder="Search job # or device"
                  preserve={{ status: filters.status, ready: filters.ready }}
                />
              </div>

              {/* Quick chips row */}
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                {quickActions.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${action.active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink)] hover:border-[var(--accent)]/30"}`}
                  >
                    {action.label} <span className={action.active ? "opacity-80" : "text-[var(--ink-muted)]"}>({action.count})</span>
                  </Link>
                ))}
                {hasActiveFilters && (
                  <Link href="/technicians" className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] hover:border-red-400/40 hover:text-red-500">
                    ✕ Clear
                  </Link>
                )}
              </div>
            </>
          );
        })()}
      </section>

      {/* Priority Spotlight */}
      {spotlightJobs.length > 0 ? (
        <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Priority Spotlight</p>
            <span className="text-[11px] text-[var(--ink-muted)]">Top {spotlightJobs.length} urgent</span>
          </div>
          <div className="grid gap-0 lg:grid-cols-3 lg:divide-x lg:divide-[var(--line)]">
            {spotlightJobs.map((job) => {
              const strip = statusStripClass(job.status);
              return (
                <article
                  key={`spotlight-${job.id}`}
                  className="relative flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--panel)] p-4 last:border-b-0 lg:border-b-0"
                >
                  {/* Left status strip */}
                  <span className={`absolute inset-y-0 left-0 w-[3px] ${strip}`} aria-hidden="true" />

                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 pl-2">
                    <div className="min-w-0">
                      <Link href={`/jobs/${job.id}`} className="mono block text-[11px] font-bold text-[var(--ink-muted)] transition-colors hover:text-[var(--accent)]">{job.jobNumber}</Link>
                      <p className="truncate text-[15px] font-semibold text-[var(--ink)]">{deviceName(job.brand, job.model) ?? deviceLabel[job.deviceType as keyof typeof deviceLabel] ?? job.deviceType}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${job.priority.tone}`}>
                      {job.priority.label}
                    </span>
                  </div>

                  {/* Issue summary */}
                  <p className="pl-2 text-xs leading-relaxed text-[var(--ink-muted)]">{shortText(job.issueDescription, 90)}</p>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-2">
                    <JobStatusBadge status={job.status} />
                    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5 opacity-40" aria-hidden="true"><circle cx="6" cy="4" r="2.5"/><path d="M1 10c0-2.21 2.24-4 5-4s5 1.79 5 4H1Z"/></svg>
                      {job.assignedTo?.name ?? "Unassigned"}
                    </span>
                    <span className="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                      {job.ageDays}d old
                    </span>
                    {job.repairTimeline ? (
                      <span className="inline-flex items-center rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-2 py-0.5 text-[10px] font-medium text-[#9A7A00]">
                        ETA {job.repairTimeline}
                      </span>
                    ) : null}
                  </div>

                  {/* ETA progress bar */}
                  {typeof job.etaProgress === "number" ? (
                    <div className="pl-2">
                      <div className="h-1 rounded-full bg-[var(--line)]">
                        <div
                          className={`h-1 rounded-full transition-all ${job.etaProgress >= 100 ? "bg-[var(--accent)]" : "bg-[var(--ink)]/40"}`}
                          style={{ width: `${Math.min(job.etaProgress, 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Next action hint */}
                  <p className="pl-2 text-[11px] italic text-[var(--ink-muted)]">
                    → {nextCourse(job)}
                  </p>

                  {/* Actions */}
                  <div className="mt-auto grid grid-cols-2 gap-2 pl-2">
                    <Link
                      href={`/jobs/${job.id}?returnTo=${encodeURIComponent(dismissSpotlightReturnTo(job.id))}`}
                      className="btn-premium rounded-lg py-1.5 text-center text-sm font-semibold text-white"
                    >
                      Open
                    </Link>
                    <Link
                      href={`/jobs/${job.id}/edit?returnTo=${encodeURIComponent(dismissSpotlightReturnTo(job.id))}`}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] py-2 text-center text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)]/20 hover:bg-[var(--panel)]"
                    >
                      Update
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

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
                  return (
                    <div
                      key={job.id}
                      className="relative border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--panel-strong)]/30"
                    >
                      <span className={`absolute inset-y-0 left-0 w-[3px] rounded-r ${strip}`} aria-hidden="true" />
                      <div className="flex items-start justify-between gap-3 pl-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
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
                            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
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
                    {sortedJobs.map((job) => {
                      const strip = statusStripClass(job.status);
                      return (
                        <tr key={job.id} className="group transition-colors hover:bg-[var(--panel-strong)]/40">
                          <td className="p-0 w-[3px]" aria-hidden="true">
                            <div className={`h-full min-h-[3rem] w-[3px] ${strip}`} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Link
                              href={`/jobs/${job.id}?returnTo=${encodeURIComponent(boardReturnTo)}`}
                              className="mono block font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                            >
                              {job.jobNumber}
                            </Link>
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
