import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldVisitStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDateTime } from "@/lib/date-eat";
import { VisitActions } from "./VisitActions";

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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-3 border-b border-[var(--line)] last:border-0 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--ink)] sm:col-span-2">{value ?? <span className="text-[var(--ink-muted)]">—</span>}</dd>
    </div>
  );
}

export default async function FieldVisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, orgId } = await requireOrgSession();

  const isManager = can.manageFieldVisits(user);
  const isFieldTech = can.recordFieldSignoffs(user);

  if (!isManager && !isFieldTech) {
    redirect("/");
  }

  const visit = await prisma.fieldVisit.findFirst({
    where: { id, orgId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      scheduledBy: { select: { id: true, name: true } },
      job: {
        select: {
          id: true,
          jobNumber: true,
          brand: true,
          model: true,
          deviceType: true,
          ...(isManager ? { client: { select: { fullName: true, phone: true } } } : {}),
        },
      },
    },
  }).catch(() => null);

  if (!visit) {
    notFound();
  }

  if (!isManager && visit.assignedToId !== user.id) {
    redirect("/field");
  }

  const canAct =
    isManager ||
    (isFieldTech && visit.assignedToId === user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/field"
          className="flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
          Field Visits
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">
            {TYPE_LABELS[visit.type] ?? visit.type} Visit
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-0.5">
            Scheduled {formatEATDateTime(visit.scheduledAt)}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[visit.status]}`}>
          {STATUS_LABELS[visit.status]}
        </span>
      </div>

      {visit.job && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Linked Job</h2>
          <dl className="divide-y divide-[var(--line)]">
            <DetailRow
              label="Job Number"
              value={
                <Link href={`/jobs/${visit.job.id}`} className="text-[var(--accent)] hover:underline">
                  {visit.job.jobNumber}
                </Link>
              }
            />
            <DetailRow label="Device" value={`${visit.job.brand} ${visit.job.model}`} />
            {isManager && visit.job.client && (
              <DetailRow label="Client" value={`${visit.job.client.fullName} — ${visit.job.client.phone}`} />
            )}
          </dl>
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Visit Details</h2>
        <dl className="divide-y divide-[var(--line)]">
          <DetailRow label="Type" value={TYPE_LABELS[visit.type] ?? visit.type} />
          <DetailRow label="Assigned To" value={visit.assignedTo.name} />
          <DetailRow label="Scheduled By" value={visit.scheduledBy.name} />
          <DetailRow label="Scheduled At" value={formatEATDateTime(visit.scheduledAt)} />
          {visit.startedAt && (
            <DetailRow label="Started At" value={formatEATDateTime(visit.startedAt)} />
          )}
          {visit.completedAt && (
            <DetailRow label="Completed At" value={formatEATDateTime(visit.completedAt)} />
          )}
        </dl>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Location & Contact</h2>
        <dl className="divide-y divide-[var(--line)]">
          <DetailRow label="Address" value={visit.address} />
          {(visit.gpsLat && visit.gpsLng) && (
            <DetailRow
              label="GPS"
              value={
                <a
                  href={`https://www.google.com/maps?q=${visit.gpsLat},${visit.gpsLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  {visit.gpsLat.toFixed(5)}, {visit.gpsLng.toFixed(5)}
                </a>
              }
            />
          )}
          <DetailRow label="Contact Name" value={visit.contactName} />
          <DetailRow label="Contact Phone" value={visit.contactPhone} />
        </dl>
      </div>

      {(visit.notes || visit.outcomeNotes || visit.signoffName) && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Notes & Sign-off</h2>
          <dl className="divide-y divide-[var(--line)]">
            {visit.notes && <DetailRow label="Notes" value={visit.notes} />}
            {visit.outcomeNotes && <DetailRow label="Outcome Notes" value={visit.outcomeNotes} />}
            {visit.signoffName && <DetailRow label="Signed Off By" value={visit.signoffName} />}
            {visit.signoffAt && <DetailRow label="Signed Off At" value={formatEATDateTime(visit.signoffAt)} />}
          </dl>
        </div>
      )}

      {canAct && !["COMPLETED", "FAILED", "CANCELLED"].includes(visit.status) && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Actions</h2>
          <VisitActions
            visitId={visit.id}
            status={visit.status}
            isManager={isManager}
            isFieldTech={isFieldTech}
          />
        </div>
      )}
    </div>
  );
}
