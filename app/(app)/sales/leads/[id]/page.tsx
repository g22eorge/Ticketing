import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeadStatus } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatEATDate, formatEATDateTime } from "@/lib/date-eat";
import { formatMoney, getAppCurrency } from "@/lib/currency";
import { updateLeadStatus, addLeadActivity, updateLeadDetails } from "../../actions";

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
  NEW:           "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  CONTACTED:     "border-purple-400/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  QUALIFIED:     "border-yellow-400/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  PROPOSAL_SENT: "border-orange-400/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  WON:           "border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  LOST:          "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  STALE:         "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: "Call",
  NOTE: "Note",
  EMAIL: "Email",
  MEETING: "Meeting",
  STATUS_CHANGE: "Status Change",
};

const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT:    "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SENT:     "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ACCEPTED: "border-green-400/30 bg-green-500/10 text-green-700 dark:text-green-400",
  REJECTED: "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  EXPIRED:  "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

type SearchParams = {
  statusError?: string;
  activityError?: string;
  editError?: string;
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
  }).catch(() => null);

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

  async function updateLeadDetailsAction(formData: FormData) {
    "use server";
    try {
      await updateLeadDetails(id, {
        fullName: String(formData.get("fullName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        organization: String(formData.get("organization") ?? ""),
        interest: String(formData.get("interest") ?? ""),
        source: String(formData.get("source") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        estimatedValue: Number(formData.get("estimatedValue") || 0) || undefined,
        followUpAt: String(formData.get("followUpAt") ?? ""),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update lead";
      redirect(`/sales/leads/${id}?editError=${encodeURIComponent(msg)}`);
    }
    redirect(`/sales/leads/${id}`);
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
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales · Lead</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">{lead.fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-muted)]">
              <span>{lead.phone}</span>
              {lead.email ? <><span className="opacity-40">·</span><span>{lead.email}</span></> : null}
              {lead.organization ? <><span className="opacity-40">·</span><span>{lead.organization}</span></> : null}
              <span className="opacity-40">·</span>
              <span>Source: {lead.source.replace("_", " ")}</span>
              {lead.assignedTo ? <><span className="opacity-40">·</span><span>Assigned to {lead.assignedTo.name}</span></> : null}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}>
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
            <details className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <summary className="cursor-pointer list-none text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
                Edit Lead Details
              </summary>
              {filters.editError ? (
                <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{filters.editError}</p>
              ) : null}
              <form action={updateLeadDetailsAction} className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Name
                  <input name="fullName" required defaultValue={lead.fullName} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Phone
                  <input name="phone" required defaultValue={lead.phone} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Email
                  <input name="email" type="email" defaultValue={lead.email ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Organization
                  <input name="organization" defaultValue={lead.organization ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Source
                  <select name="source" defaultValue={lead.source} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50">
                    <option value="WALK_IN">Walk in</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="PHONE">Phone</option>
                    <option value="SOCIAL_MEDIA">Social media</option>
                    <option value="WEBSITE">Website</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Estimated Value
                  <input name="estimatedValue" type="number" min="0" step="1" defaultValue={lead.estimatedValue ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)]">
                  Follow-up
                  <input name="followUpAt" type="date" defaultValue={lead.followUpAt ? lead.followUpAt.toISOString().slice(0, 10) : ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)] md:col-span-2">
                  Interest
                  <input name="interest" defaultValue={lead.interest ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <label className="space-y-1 text-[12px] font-semibold text-[var(--ink-muted)] md:col-span-2">
                  Notes
                  <textarea name="notes" rows={3} defaultValue={lead.notes ?? ""} className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--accent)]/50" />
                </label>
                <div className="md:col-span-2">
                  <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-[12px] font-bold">
                    Save Lead
                  </button>
                </div>
              </form>
            </details>
          ) : null}

          {canEdit ? (
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Update Status</p>
              {filters.statusError ? (
                <p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{filters.statusError}</p>
              ) : null}
              <form action={updateStatusAction} className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <select name="status" defaultValue={lead.status} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50">
                    {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                      <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <input name="note" placeholder="Optional note…" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15" />
                  <button type="submit" className="btn-premium rounded-lg px-4 py-2 text-[12px] font-bold">
                    Update
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Activity Timeline</p>
            </div>

            {canEdit ? (
              <div className="border-b border-[var(--line)] px-4 py-3">
                {filters.activityError ? (
                  <p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">{filters.activityError}</p>
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
                  <button type="submit" className="btn-premium-secondary rounded-lg px-4 py-2 text-[12px] font-semibold">
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
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--panel-strong)] text-[12px] font-bold text-[var(--ink-muted)]">
                      {activity.type.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--ink)]">{ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}</span>
                        <span className="text-[13px] text-[var(--ink-muted)]">by {activity.user.name}</span>
                        <span className="ml-auto text-[12px] text-[var(--ink-muted)]">{formatEATDateTime(activity.createdAt)}</span>
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
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Quotations</p>
              {can.createQuotations(user) ? (
                <Link
                  href={`/sales/quotations/new?leadId=${lead.id}`}
                  className="text-[13px] font-semibold text-[var(--accent)] hover:underline"
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
                      <p className="text-[13px] text-[var(--ink-muted)]">{formatMoney(q.totalAmount, q.currency)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold ${QUOTATION_STATUS_COLORS[q.status] ?? ""}`}>
                      {q.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Details</p>
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
