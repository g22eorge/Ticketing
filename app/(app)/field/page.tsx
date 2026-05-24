import Link from "next/link";
import { redirect } from "next/navigation";
import { FieldVisitStatus } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { formatEATDateTime } from "@/lib/date-eat";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<FieldVisitStatus, string> = {
  SCHEDULED:  "Scheduled",
  EN_ROUTE:   "En Route",
  ARRIVED:    "Arrived",
  COMPLETED:  "Completed",
  FAILED:     "Failed",
  CANCELLED:  "Cancelled",
};

const STATUS_COLORS: Record<FieldVisitStatus, string> = {
  SCHEDULED:  "bg-blue-100 text-blue-800",
  EN_ROUTE:   "bg-yellow-100 text-yellow-800",
  ARRIVED:    "bg-orange-100 text-orange-800",
  COMPLETED:  "bg-emerald-100 text-emerald-800",
  FAILED:     "bg-red-100 text-red-800",
  CANCELLED:  "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  COLLECTION:   "Collection",
  DELIVERY:     "Delivery",
  ONSITE_REPAIR:"Onsite Repair",
  ASSESSMENT:   "Assessment",
  FOLLOWUP:     "Follow-up",
};

const TYPE_COLORS: Record<string, string> = {
  COLLECTION:   "bg-purple-100 text-purple-800",
  DELIVERY:     "bg-teal-100 text-teal-800",
  ONSITE_REPAIR:"bg-red-100 text-red-800",
  ASSESSMENT:   "bg-indigo-100 text-indigo-800",
  FOLLOWUP:     "bg-gray-100 text-gray-700",
};

const TAB_OPTIONS = [
  { key: "upcoming",   label: "Upcoming"  },
  { key: "COMPLETED",  label: "Completed" },
  { key: "FAILED",     label: "Failed"    },
  { key: "CANCELLED",  label: "Cancelled" },
  { key: "ALL",        label: "All"       },
] as const;

export default async function FieldPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);

  const isManager    = can.manageFieldVisits(user);
  const isFieldTech  = can.recordFieldSignoffs(user);

  if (!isManager && !isFieldTech) redirect("/");

  const { status: statusParam } = await searchParams;
  const activeTab = statusParam ?? "upcoming";

  const now           = new Date();
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd      = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const kpiBaseWhere = !isManager ? { assignedToId: user.id } : {};

  // ── KPI counts + staff-breakdown source data in parallel ─────────────────
  const [
    kpiTotal,
    kpiPending,
    kpiCompletedMonth,
    kpiFailedMonth,
    kpiToday,
    monthVisits,       // used for staff breakdown + type breakdown
  ] = await Promise.all([
    db.fieldVisit.count({ where: kpiBaseWhere }).catch(() => 0),
    db.fieldVisit.count({ where: { ...kpiBaseWhere, status: { in: ["SCHEDULED", "EN_ROUTE", "ARRIVED"] } } }).catch(() => 0),
    db.fieldVisit.count({ where: { ...kpiBaseWhere, status: "COMPLETED", scheduledAt: { gte: monthStart } } }).catch(() => 0),
    db.fieldVisit.count({ where: { ...kpiBaseWhere, status: "FAILED",    scheduledAt: { gte: monthStart } } }).catch(() => 0),
    db.fieldVisit.count({ where: { ...kpiBaseWhere, scheduledAt: { gte: todayStart, lte: todayEnd } } }).catch(() => 0),
    isManager
      ? db.fieldVisit.findMany({
          where: { scheduledAt: { gte: monthStart } },
          select: {
            status: true,
            type:   true,
            assignedTo: { select: { id: true, name: true, role: true } },
          },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  // ── Staff breakdown (manager view only) ──────────────────────────────────
  type StaffRow = {
    id: string;
    name: string;
    role: string;
    total: number;
    pending: number;
    completed: number;
    failed: number;
    rate: number; // completion rate %
  };

  const staffMap = new Map<string, StaffRow>();
  if (isManager) {
    for (const v of monthVisits) {
      const tech = v.assignedTo;
      if (!tech) continue;
      if (!staffMap.has(tech.id)) {
        staffMap.set(tech.id, { id: tech.id, name: tech.name, role: tech.role, total: 0, pending: 0, completed: 0, failed: 0, rate: 0 });
      }
      const row = staffMap.get(tech.id)!;
      row.total++;
      if (["SCHEDULED", "EN_ROUTE", "ARRIVED"].includes(v.status)) row.pending++;
      if (v.status === "COMPLETED") row.completed++;
      if (v.status === "FAILED")    row.failed++;
    }
    for (const row of staffMap.values()) {
      const terminal = row.completed + row.failed;
      row.rate = terminal > 0 ? Math.round((row.completed / terminal) * 100) : 0;
    }
  }
  const staffRows = [...staffMap.values()].sort((a, b) => b.total - a.total);

  // ── Visit type breakdown (this month) ────────────────────────────────────
  const typeCount: Record<string, number> = {};
  for (const v of monthVisits) {
    typeCount[v.type] = (typeCount[v.type] ?? 0) + 1;
  }
  const typeBreakdown = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count, label: TYPE_LABELS[type] ?? type, color: TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700" }));

  // ── Completion rate for KPI sub-label ────────────────────────────────────
  const terminalMonth = kpiCompletedMonth + kpiFailedMonth;
  const completionRate = terminalMonth > 0 ? Math.round((kpiCompletedMonth / terminalMonth) * 100) : null;

  // ── Tab-filtered visit list ───────────────────────────────────────────────
  let statusFilter: FieldVisitStatus[] | undefined;
  if      (activeTab === "upcoming") statusFilter = ["SCHEDULED", "EN_ROUTE", "ARRIVED"];
  else if (activeTab === "ALL")      statusFilter = undefined;
  else if (Object.keys(STATUS_LABELS).includes(activeTab)) statusFilter = [activeTab as FieldVisitStatus];
  else    statusFilter = ["SCHEDULED", "EN_ROUTE", "ARRIVED"];

  const visits = await db.fieldVisit.findMany({
    where: {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(!isManager ? { assignedToId: user.id } : {}),
    },
    include: {
      assignedTo:  { select: { id: true, name: true } },
      scheduledBy: { select: { id: true, name: true } },
      job:         { select: { id: true, jobNumber: true, brand: true, model: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  }).catch(() => []);

  return (
    <div className="space-y-5 p-4 md:p-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Service</p>
          <h1 className="mt-0.5 text-xl font-bold text-[var(--ink)]">Field Visits</h1>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {isManager ? "All scheduled field visits" : "Your assigned field visits"}
          </p>
        </div>
        {isManager && (
          <Link
            href="/field/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Schedule Visit
          </Link>
        )}
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Today&apos;s Visits</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiToday}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">scheduled today</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Pending</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiPending}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">scheduled · en route · arrived</p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Completed This Month</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{kpiCompletedMonth}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
            {completionRate !== null ? `${completionRate}% success rate` : "this month"}
          </p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Failed This Month</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${kpiFailedMonth > 0 ? "text-red-600" : "text-[var(--ink)]"}`}>{kpiFailedMonth}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
            {terminalMonth > 0 ? `${100 - (completionRate ?? 100)}% failure rate` : "this month"}
          </p>
        </div>
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total Visits</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--ink)]">{kpiTotal}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">all time</p>
        </div>
      </div>

      {/* ── Visit Type Breakdown + Staff Breakdown (manager only) ── */}
      {isManager && (
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Visit type breakdown */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Visit Types — This Month</p>
            {typeBreakdown.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ink-muted)]">No visits this month.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {typeBreakdown.map(({ type, count, label, color }) => {
                  const pct = monthVisits.length > 0 ? Math.round((count / monthVisits.length) * 100) : 0;
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>{label}</span>
                        <span className="text-xs font-semibold tabular-nums text-[var(--ink)]">{count} <span className="text-[var(--ink-muted)] font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-strong)]">
                        <div className="h-full rounded-full bg-[var(--accent)]/60" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staff breakdown */}
          <div className="lg:col-span-2 panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] bg-[var(--panel-strong)]/50 px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Staff Performance — This Month</p>
            </div>
            {staffRows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--ink-muted)]">No visits assigned this month.</p>
            ) : (
              <>
                {/* Mobile staff cards */}
                <div className="divide-y divide-[var(--line)] lg:hidden">
                  {staffRows.map((row) => (
                    <div key={`m-${row.id}`} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-[var(--ink)]">{row.name}</p>
                          <p className="text-[11px] text-[var(--ink-muted)] capitalize">{row.role.replace(/_/g, " ").toLowerCase()}</p>
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${row.rate >= 80 ? "text-emerald-700" : row.rate >= 60 ? "text-amber-700" : row.completed + row.failed > 0 ? "text-red-600" : "text-[var(--ink-muted)]"}`}>
                          {row.completed + row.failed > 0 ? `${row.rate}%` : "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--ink-muted)]">
                        <span>Total: <strong className="text-[var(--ink)]">{row.total}</strong></span>
                        <span>Pending: {row.pending}</span>
                        <span className="text-emerald-700">Done: <strong>{row.completed}</strong></span>
                        {row.failed > 0 && <span className="text-red-600">Failed: <strong>{row.failed}</strong></span>}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)]">
                        {["Staff Member", "Total", "Pending", "Completed", "Failed", "Success Rate"].map((h) => (
                          <th key={h} className={`px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] ${h === "Staff Member" ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {staffRows.map((row) => (
                        <tr key={row.id} className="hover:bg-[var(--panel-strong)]/30">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-[var(--ink)]">{row.name}</p>
                            <p className="text-[11px] text-[var(--ink-muted)] capitalize">{row.role.replace(/_/g, " ").toLowerCase()}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--ink)]">{row.total}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--ink-muted)]">{row.pending}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-semibold">{row.completed}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            <span className={row.failed > 0 ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}>{row.failed}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`text-xs font-bold tabular-nums ${row.rate >= 80 ? "text-emerald-700" : row.rate >= 60 ? "text-amber-700" : "text-red-600"}`}>
                              {row.completed + row.failed > 0 ? `${row.rate}%` : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-[var(--line)]">
        {TAB_OPTIONS.map((tab) => (
          <Link
            key={tab.key}
            href={`/field?status=${tab.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-[var(--accent)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* ── Visit list ── */}
      {visits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--ink-muted)]">No field visits found for this filter.</p>
        </div>
      ) : (
        <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          {/* Mobile visit cards */}
          <div className="divide-y divide-[var(--line)] lg:hidden">
            {visits.map((visit) => (
              <div key={`m-${visit.id}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[visit.type] ?? "bg-gray-100 text-gray-700"}`}>{TYPE_LABELS[visit.type] ?? visit.type}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[visit.status]}`}>{STATUS_LABELS[visit.status]}</span>
                  </div>
                  <Link href={`/field/${visit.id}`} className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline">View →</Link>
                </div>
                <p className="mt-1 text-xs text-[var(--ink)]">{formatEATDateTime(visit.scheduledAt)}</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--ink-muted)]">{visit.address}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--ink-muted)]">
                  {visit.contactName && <span>Contact: {visit.contactName}{visit.contactPhone ? ` (${visit.contactPhone})` : ""}</span>}
                  {isManager && <span>Assigned: <span className="text-[var(--ink)]">{visit.assignedTo.name}</span></span>}
                  {visit.job && (
                    <span>Job: <Link href={`/jobs/${visit.job.id}`} className="font-mono font-semibold text-[var(--accent)] hover:underline">{visit.job.jobNumber}</Link></span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-[var(--line)] text-sm">
              <thead>
                <tr className="bg-[var(--panel-strong)]/60">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Date / Time</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Type</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Address</th>
                  {isManager && (
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Assigned To</th>
                  )}
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Contact</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Job</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Status</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visits.map((visit) => (
                  <tr key={visit.id} className="hover:bg-[var(--panel-strong)]/30 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-[var(--ink)]">
                      {formatEATDateTime(visit.scheduledAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[visit.type] ?? "bg-gray-100 text-gray-700"}`}>
                        {TYPE_LABELS[visit.type] ?? visit.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[180px] truncate text-xs text-[var(--ink)]">
                      {visit.address}
                    </td>
                    {isManager && (
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-[var(--ink)]">
                        {visit.assignedTo.name}
                      </td>
                    )}
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-[var(--ink-muted)]">
                      {visit.contactName ?? "—"}
                      {visit.contactPhone && (
                        <span className="ml-1 text-[var(--ink-muted)]/60">({visit.contactPhone})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                      {visit.job ? (
                        <Link href={`/jobs/${visit.job.id}`} className="font-mono font-semibold text-[var(--accent)] hover:underline">
                          {visit.job.jobNumber}
                        </Link>
                      ) : (
                        <span className="text-[var(--ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[visit.status]}`}>
                        {STATUS_LABELS[visit.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link
                        href={`/field/${visit.id}`}
                        className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
