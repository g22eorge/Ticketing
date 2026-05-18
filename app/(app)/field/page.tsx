import Link from "next/link";
import { redirect } from "next/navigation";
import { FieldVisitStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDateTime } from "@/lib/date-eat";

const STATUS_LABELS: Record<FieldVisitStatus, string> = {
  SCHEDULED: "Scheduled",
  EN_ROUTE: "En Route",
  ARRIVED: "Arrived",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<FieldVisitStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  EN_ROUTE: "bg-yellow-100 text-yellow-800",
  ARRIVED: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  COLLECTION: "Collection",
  DELIVERY: "Delivery",
  ONSITE_REPAIR: "Onsite Repair",
  ASSESSMENT: "Assessment",
  FOLLOWUP: "Follow-up",
};

const TYPE_COLORS: Record<string, string> = {
  COLLECTION: "bg-purple-100 text-purple-800",
  DELIVERY: "bg-teal-100 text-teal-800",
  ONSITE_REPAIR: "bg-red-100 text-red-800",
  ASSESSMENT: "bg-indigo-100 text-indigo-800",
  FOLLOWUP: "bg-gray-100 text-gray-700",
};

const TAB_OPTIONS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
] as const;

export default async function FieldPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, orgId } = await requireOrgSession();

  const isManager = can.manageFieldVisits(user);
  const isFieldTech = can.recordFieldSignoffs(user);

  if (!isManager && !isFieldTech) {
    redirect("/");
  }

  const { status: statusParam } = await searchParams;
  const activeTab = statusParam ?? "upcoming";

  let statusFilter: FieldVisitStatus[] | undefined;
  if (activeTab === "upcoming") {
    statusFilter = ["SCHEDULED", "EN_ROUTE", "ARRIVED"];
  } else if (activeTab === "ALL") {
    statusFilter = undefined;
  } else if (Object.keys(STATUS_LABELS).includes(activeTab)) {
    statusFilter = [activeTab as FieldVisitStatus];
  } else {
    statusFilter = ["SCHEDULED", "EN_ROUTE", "ARRIVED"];
  }

  const assignedToFilter = !isManager ? { assignedToId: user.id } : {};

  const visits = await prisma.fieldVisit.findMany({
    where: {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...assignedToFilter,
      orgId,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      scheduledBy: { select: { id: true, name: true } },
      job: { select: { id: true, jobNumber: true, brand: true, model: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Field Visits</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-0.5">
            {isManager ? "All scheduled field visits" : "Your assigned field visits"}
          </p>
        </div>
        {isManager && (
          <Link
            href="/field/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Schedule Visit
          </Link>
        )}
      </div>

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

      {visits.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--ink-muted)]">No field visits found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <table className="min-w-full divide-y divide-[var(--line)] text-sm">
            <thead>
              <tr className="bg-[var(--panel-strong)]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Date / Time</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Address</th>
                {isManager && (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Assigned To</th>
                )}
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Contact</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {visits.map((visit) => (
                <tr key={visit.id} className="hover:bg-[var(--panel-strong)] transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--ink)]">
                    {formatEATDateTime(visit.scheduledAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_COLORS[visit.type] ?? "bg-gray-100 text-gray-700"}`}>
                      {TYPE_LABELS[visit.type] ?? visit.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-[var(--ink)]">
                    {visit.address}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-muted)]">
                      {visit.assignedTo.name}
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--ink-muted)]">
                    {visit.contactName ?? "-"}
                    {visit.contactPhone && (
                      <span className="ml-1 text-[var(--ink-muted)]/70">({visit.contactPhone})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[visit.status]}`}>
                      {STATUS_LABELS[visit.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/field/${visit.id}`}
                      className="text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
