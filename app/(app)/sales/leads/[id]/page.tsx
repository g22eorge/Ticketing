import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeadStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { updateLeadStatus, addLeadActivity } from "../../actions";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL_SENT: "Proposal Sent",
  WON: "Won",
  LOST: "Lost",
  STALE: "Stale",
};

const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: "border-blue-200 bg-blue-50 text-blue-700",
  CONTACTED: "border-purple-200 bg-purple-50 text-purple-700",
  QUALIFIED: "border-yellow-200 bg-yellow-50 text-yellow-700",
  PROPOSAL_SENT: "border-orange-200 bg-orange-50 text-orange-700",
  WON: "border-green-200 bg-green-50 text-green-700",
  LOST: "border-red-200 bg-red-50 text-red-600",
  STALE: "border-slate-200 bg-slate-50 text-slate-500",
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: "Call",
  NOTE: "Note",
  EMAIL: "Email",
  MEETING: "Meeting",
  STATUS_CHANGE: "Status Change",
};

const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  SENT: "border-blue-200 bg-blue-50 text-blue-700",
  ACCEPTED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-600",
  EXPIRED: "border-slate-200 bg-slate-100 text-slate-500",
};

type SearchParams = {
  statusError?: string;
  activityError?: string;
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const { user, orgId } = await requireOrgSession();

  if (!can.createLeads(user) && !can.viewAllSales(user)) {
    redirect("/dashboard");
  }

  const lead = await prisma.lead.findFirst({
    where: { id, orgId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      activities: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      quotations: {
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) notFound();
  if (!can.viewAllSales(user) && lead.assignedToId !== user.id && lead.createdById !== user.id) redirect("/sales");

  const canEdit = can.createLeads(user);
  const currency = getAppCurrency();

  async function updateStatusAction(formData: FormData) {
    "use server";
    const status = String(formData.get("status") ?? "") as LeadStatus;
    const note = String(formData.get("note") ?? "") || undefined;
    const validStatuses: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST", "STALE"];
    if (!validStatuses.includes(status)) {
      redirect(`/sales/leads/${id}?statusError=${encodeURIComponent("Invalid status")}`);
    }
    try {
      await updateLeadStatus(id, status, note);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update status";
      redirect(`/sales/leads/${id}?statusError=${encodeURIComponent(msg)}`);
    }
  }

  async function addActivityAction(formData: FormData) {
    "use server";
    const type = String(formData.get("type") ?? "NOTE");
    const note = String(formData.get("note") ?? "");
    if (!note.trim()) {
      redirect(`/sales/leads/${id}?activityError=${encodeURIComponent("Note is required")}`);
    }
    try {
      await addLeadActivity(id, { type, note });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add activity";
      redirect(`/sales/leads/${id}?activityError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/leads/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Link href="/sales?tab=leads" className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline">
                ← Sales
              </Link>
            </div>
            <h1 className="text-lg font-bold text-[var(--ink)]">{lead.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-muted)]">
              <span>{lead.phone}</span>
              {lead.email ? <><span className="opacity-40">·</span><span>{lead.email}</span></> : null}
              {lead.organization ? <><span className="opacity-40">·</span><span>{lead.organization}</span></> : null}
              <span className="opacity-40">·</span>
              <span>Source: {lead.source.replace("_", " ")}</span>
              {lead.assignedTo ? <><span className="opacity-40">·</span><span>Assigned to {lead.assignedTo.name}</span></> : null}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}>
            {LEAD_STATUS_LABELS[lead.status]}
          </span>
        </div>

        {lead.interest ? (
          <p className="mt-2 text-[12px] text-[var(--ink-muted)]">
            <span className="font-semibold text-[var(--ink)]">Interest:</span> {lead.interest}
          </p>
        ) : null}
        {lead.estimatedValue != null ? (
          <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
            <span className="font-semibold text-[var(--ink)]">Est. value:</span> {formatMoney(lead.estimatedValue, currency)}
          </p>
        ) : null}
        {lead.notes ? (
          <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
            <span className="font-semibold text-[var(--ink)]">Notes:</span> {lead.notes}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {canEdit ? (
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Update Status</p>
              {filters.statusError ? (
                <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{filters.statusError}</p>
              ) : null}
              <form action={updateStatusAction} className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <select name="status" defaultValue={lead.status} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                    {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                      <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <input name="note" placeholder="Optional note…" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                  <button type="submit" className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90">
                    Update
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Activity Timeline</p>
            </div>

            {canEdit ? (
              <div className="border-b border-[var(--line)] px-4 py-3">
                {filters.activityError ? (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{filters.activityError}</p>
                ) : null}
                <form action={addActivityAction} className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <select name="type" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                      <option value="NOTE">Note</option>
                      <option value="CALL">Call</option>
                      <option value="EMAIL">Email</option>
                      <option value="MEETING">Meeting</option>
                    </select>
                    <textarea name="note" required placeholder="Activity note…" rows={2} className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                  </div>
                  <button type="submit" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-[12px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
                    Add Activity
                  </button>
                </form>
              </div>
            ) : null}

            {lead.activities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">No activity yet</p>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {lead.activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 px-4 py-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--panel-strong)] text-[10px] font-bold text-[var(--ink-muted)]">
                      {activity.type.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[var(--ink)]">{ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}</span>
                        <span className="text-[11px] text-[var(--ink-muted)]">by {activity.user.name}</span>
                        <span className="ml-auto text-[10px] text-[var(--ink-muted)]">{formatEATDateTime(activity.createdAt)}</span>
                      </div>
                      {activity.note ? <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{activity.note}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Quotations</p>
              {can.createQuotations(user) ? (
                <Link
                  href={`/sales/quotations/new?leadId=${lead.id}`}
                  className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
                >
                  + Create
                </Link>
              ) : null}
            </div>
            {lead.quotations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">No quotations linked</p>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {lead.quotations.map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <Link href={`/sales/quotations/${q.id}`} className="text-[12px] font-semibold text-[var(--ink)] hover:text-[var(--accent)] hover:underline">
                        {q.quoteNumber}
                      </Link>
                      <p className="text-[11px] text-[var(--ink-muted)]">{formatMoney(q.totalAmount, q.currency)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUOTATION_STATUS_COLORS[q.status] ?? ""}`}>
                      {q.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
            <dl className="space-y-1 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">Created</dt>
                <dd className="font-medium text-[var(--ink)]">{formatEATDate(lead.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">Created by</dt>
                <dd className="font-medium text-[var(--ink)]">{lead.createdBy?.name ?? "Unknown"}</dd>
              </div>
              {lead.followUpAt ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--ink-muted)]">Follow-up</dt>
                  <dd className="font-medium text-[var(--ink)]">{formatEATDate(lead.followUpAt)}</dd>
                </div>
              ) : null}
              {lead.convertedAt ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--ink-muted)]">Converted</dt>
                  <dd className="font-medium text-green-700">{formatEATDate(lead.convertedAt)}</dd>
                </div>
              ) : null}
              {lead.closedAt ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--ink-muted)]">Closed</dt>
                  <dd className="font-medium text-[var(--ink)]">{formatEATDate(lead.closedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
