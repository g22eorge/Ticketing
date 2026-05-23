import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, LeadStatus, LeadSource } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatEATDate } from "@/lib/date-eat";
import { formatMoney, formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { createLead } from "./actions";

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
  NEW:           "border-blue-200 bg-blue-50 text-blue-700",
  CONTACTED:     "border-purple-200 bg-purple-50 text-purple-700",
  QUALIFIED:     "border-yellow-200 bg-yellow-50 text-yellow-700",
  PROPOSAL_SENT: "border-orange-200 bg-orange-50 text-orange-700",
  WON:           "border-green-200 bg-green-50 text-green-700",
  LOST:          "border-red-200 bg-red-50 text-red-600",
  STALE:         "border-slate-200 bg-slate-50 text-slate-500",
};

const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT:    "border-slate-200 bg-slate-50 text-slate-600",
  SENT:     "border-blue-200 bg-blue-50 text-blue-700",
  ACCEPTED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-600",
  EXPIRED:  "border-slate-200 bg-slate-100 text-slate-500",
};

type SearchParams = {
  tab?: string;
  status?: string;
  q?: string;
  createError?: string;
  newLead?: string;
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user } = await getCurrentUserRole();

  if (!can.viewAllSales(user) && !can.createLeads(user)) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const activeTab    = filters.tab === "quotations" ? "quotations" : "leads";
  const statusFilter = filters.status as LeadStatus | undefined;
  const searchQ      = (filters.q ?? "").trim();
  const currency     = getAppCurrency();

  const onlyOwn = !can.viewAllSales(user) && can.createLeads(user);

  const quotationWhere: Prisma.QuotationWhereInput = {
    ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
    ...(searchQ
      ? {
          OR: [
            { quoteNumber: { contains: searchQ } },
            { lead:   { fullName: { contains: searchQ } } },
            { client: { fullName: { contains: searchQ } } },
          ],
        }
      : {}),
  };

  const leadsWhere: Prisma.LeadWhereInput = {
    ...(onlyOwn ? { assignedToId: user.id } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(searchQ
      ? {
          OR: [
            { fullName: { contains: searchQ } },
            { phone:    { contains: searchQ } },
            { organization: { contains: searchQ } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const activeLeadsWhere: Prisma.LeadWhereInput = {
    ...(onlyOwn ? { assignedToId: user.id } : {}),
    status: { notIn: ["WON", "LOST", "STALE"] },
  };

  const [
    leads,
    quotations,
    leadCounts,
    pipelineStats,
    wonThisMonth,
    wonLastMonth,
    quotationStats,
    acceptedQuoteStats,
    followupsDue,
  ] = await Promise.all([
    activeTab === "leads"
      ? prisma.lead.findMany({
          where: leadsWhere,
          include: {
            assignedTo: { select: { id: true, name: true } },
            createdBy:  { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }).catch(() => [])
      : Promise.resolve([]),

    activeTab === "quotations"
      ? prisma.quotation.findMany({
          where: quotationWhere,
          include: {
            lead:      { select: { id: true, fullName: true } },
            client:    { select: { id: true, fullName: true } },
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }).catch(() => [])
      : Promise.resolve([]),

    prisma.lead
      .groupBy({
        by: ["status"],
        where: { ...(onlyOwn ? { assignedToId: user.id } : {}) },
        _count: true,
      })
      .catch(() => []),

    // Pipeline stats — active leads only
    prisma.lead.aggregate({
      where: { ...activeLeadsWhere, estimatedValue: { not: null } },
      _sum:   { estimatedValue: true },
      _count: true,
    }).catch(() => ({ _sum: { estimatedValue: 0 }, _count: 0 })),

    // Won this month
    prisma.lead.count({
      where: {
        ...(onlyOwn ? { assignedToId: user.id } : {}),
        status: "WON",
        updatedAt: { gte: thisMonthStart },
      },
    }).catch(() => 0),

    // Won last month (for delta)
    prisma.lead.count({
      where: {
        ...(onlyOwn ? { assignedToId: user.id } : {}),
        status: "WON",
        updatedAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
    }).catch(() => 0),

    // All quotation stats
    prisma.quotation.aggregate({
      where: { ...(!can.viewAllSales(user) ? { createdById: user.id } : {}) },
      _sum:   { totalAmount: true },
      _count: true,
    }).catch(() => ({ _sum: { totalAmount: 0 }, _count: 0 })),

    // Accepted quotations value
    prisma.quotation.aggregate({
      where: {
        ...(!can.viewAllSales(user) ? { createdById: user.id } : {}),
        status: "ACCEPTED",
      },
      _sum:   { totalAmount: true },
      _count: true,
    }).catch(() => ({ _sum: { totalAmount: 0 }, _count: 0 })),

    // Follow-ups due today or overdue
    prisma.lead.count({
      where: {
        ...(onlyOwn ? { assignedToId: user.id } : {}),
        status: { notIn: ["WON", "LOST", "STALE"] },
        followUpAt: { lte: now },
      },
    }).catch(() => 0),
  ]);

  // ── Compute KPIs ────────────────────────────────────────────────────────
  const statusCounts: Partial<Record<LeadStatus, number>> = {};
  for (const row of leadCounts as Array<{ status: LeadStatus; _count: number }>) {
    statusCounts[row.status] = row._count;
  }
  const totalLeads = Object.values(statusCounts).reduce((a, b) => a + (b ?? 0), 0);
  const totalWon   = statusCounts["WON"] ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0;

  const pipelineValue   = pipelineStats._sum.estimatedValue ?? 0;
  const activePipeline  = (pipelineStats as { _count: number })._count;
  const quoteTotal      = quotationStats._sum.totalAmount ?? 0;
  const acceptedTotal   = acceptedQuoteStats._sum.totalAmount ?? 0;
  const acceptanceRate  =
    (quotationStats as { _count: number })._count > 0
      ? Math.round(((acceptedQuoteStats as { _count: number })._count / (quotationStats as { _count: number })._count) * 100)
      : 0;

  const wonMomChange =
    wonLastMonth > 0
      ? ((wonThisMonth - wonLastMonth) / wonLastMonth) * 100
      : null;

  const showNewLead = filters.newLead === "1" || Boolean(filters.createError);

  async function createLeadAction(formData: FormData) {
    "use server";
    const rawSource = String(formData.get("source") ?? "WALK_IN");
    const validSources: LeadSource[] = ["WALK_IN", "REFERRAL", "PHONE", "SOCIAL_MEDIA", "WEBSITE", "OTHER"];
    const source = validSources.includes(rawSource as LeadSource) ? (rawSource as LeadSource) : "WALK_IN";
    try {
      await createLead({
        fullName:       String(formData.get("fullName") ?? ""),
        phone:          String(formData.get("phone") ?? ""),
        email:          String(formData.get("email") ?? "") || undefined,
        organization:   String(formData.get("organization") ?? "") || undefined,
        interest:       String(formData.get("interest") ?? "") || undefined,
        source,
        notes:          String(formData.get("notes") ?? "") || undefined,
        estimatedValue: formData.get("estimatedValue") ? Number(formData.get("estimatedValue")) : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create lead";
      redirect(`/sales?tab=leads&newLead=1&createError=${encodeURIComponent(msg)}`);
    }
  }

  return (
    <div className="space-y-4">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div>
          <h1 className="text-base font-bold text-[var(--ink)]">Sales CRM</h1>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">Leads pipeline and quotations</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "leads" && can.createLeads(user) ? (
            <Link
              href="/sales?tab=leads&newLead=1"
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90"
            >
              + New Lead
            </Link>
          ) : null}
          {activeTab === "quotations" && can.createQuotations(user) ? (
            <Link
              href="/sales/quotations/new"
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90"
            >
              + New Quotation
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── KPI TILES ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

        {/* Active pipeline */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Active Pipeline
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(pipelineValue, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {activePipeline} open lead{activePipeline !== 1 ? "s" : ""} with value
          </p>
        </div>

        {/* Won this month */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Won This Month
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600">
            {wonThisMonth}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {conversionRate}% all-time conversion
            {wonMomChange !== null && (
              <span className={`ml-1.5 font-semibold ${wonMomChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {wonMomChange >= 0 ? "+" : ""}{wonMomChange.toFixed(0)}% MoM
              </span>
            )}
          </p>
        </div>

        {/* Quotations */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Quotations (Total)
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(quoteTotal, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {acceptanceRate}% acceptance ·{" "}
            <span className="text-emerald-600 font-semibold">
              {formatMoneyCompact(acceptedTotal, currency)}
            </span>{" "}
            accepted
          </p>
        </div>

        {/* Follow-ups due */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Follow-ups Due
          </p>
          <p
            className={`mt-1.5 text-2xl font-bold tabular-nums ${
              followupsDue > 0 ? "text-amber-600" : "text-[var(--ink)]"
            }`}
          >
            {followupsDue}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
            {followupsDue > 0 ? "overdue or due today" : "all follow-ups clear"}
          </p>
        </div>
      </div>

      {/* ── SEARCH + TABS ──────────────────────────────────────────────────── */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">

        {/* Tab row */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pr-3">
          <div className="flex">
            <Link
              href={`/sales?tab=leads${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ""}`}
              className={`px-5 py-3 text-[12px] font-semibold transition-colors ${
                activeTab === "leads"
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Leads
              <span className="ml-1.5 rounded-full bg-[var(--panel-strong)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-muted)]">
                {totalLeads}
              </span>
            </Link>
            {can.createQuotations(user) ? (
              <Link
                href={`/sales?tab=quotations${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ""}`}
                className={`px-5 py-3 text-[12px] font-semibold transition-colors ${
                  activeTab === "quotations"
                    ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                Quotations
              </Link>
            ) : null}
          </div>

          {/* Search */}
          <form method="GET" className="flex items-center gap-1.5">
            <input type="hidden" name="tab" value={activeTab} />
            <input
              name="q"
              defaultValue={searchQ}
              placeholder={activeTab === "leads" ? "Search name, phone…" : "Search quote # or name…"}
              className="w-48 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]/50"
            />
            {searchQ && (
              <Link
                href={`/sales?tab=${activeTab}`}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                ✕
              </Link>
            )}
          </form>
        </div>

        {/* ── LEADS TAB ──────────────────────────────────────────────── */}
        {activeTab === "leads" ? (
          <div>
            {/* Status filter pills */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <Link
                href={`/sales?tab=leads${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ""}`}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  !statusFilter
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
                }`}
              >
                <span className={!statusFilter ? "text-white font-bold" : "font-bold text-[var(--ink)]"}>
                  {totalLeads}
                </span>{" "}
                all
              </Link>
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                <Link
                  key={s}
                  href={`/sales?tab=leads&status=${s}${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ""}`}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    statusFilter === s
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  <span className={statusFilter === s ? "text-white font-bold" : "font-bold text-[var(--ink)]"}>
                    {statusCounts[s] ?? 0}
                  </span>{" "}
                  {LEAD_STATUS_LABELS[s]}
                </Link>
              ))}
            </div>

            {/* New lead form */}
            {showNewLead && can.createLeads(user) ? (
              <div className="border-b border-[var(--line)] px-4 py-3">
                {filters.createError ? (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {filters.createError}
                  </p>
                ) : null}
                <form action={createLeadAction} noValidate className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                    New Lead
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <input
                      name="fullName"
                      required
                      placeholder="Full name *"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <input
                      name="phone"
                      required
                      placeholder="Phone *"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <input
                      name="email"
                      placeholder="Email"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <input
                      name="organization"
                      placeholder="Organization"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <input
                      name="interest"
                      placeholder="Interest / product"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <input
                      name="estimatedValue"
                      type="number"
                      placeholder={`Est. value (${currency})`}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15"
                    />
                    <select
                      name="source"
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                    >
                      <option value="WALK_IN">Walk-in</option>
                      <option value="REFERRAL">Referral</option>
                      <option value="PHONE">Phone</option>
                      <option value="SOCIAL_MEDIA">Social Media</option>
                      <option value="WEBSITE">Website</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <textarea
                      name="notes"
                      placeholder="Notes"
                      rows={2}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/15 sm:col-span-2"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent)]/90"
                    >
                      Create Lead
                    </button>
                    <Link
                      href="/sales?tab=leads"
                      className="text-xs font-medium text-[var(--ink-muted)] underline-offset-2 hover:underline"
                    >
                      Cancel
                    </Link>
                  </div>
                </form>
              </div>
            ) : null}

            {leads.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <p className="text-sm font-medium text-[var(--ink-muted)]">No leads match this view</p>
                {statusFilter ? (
                  <Link href="/sales?tab=leads" className="text-xs text-[var(--accent)] hover:underline">
                    Clear filter
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-[13px]">
                    <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                      <tr className="border-b border-[var(--line)]">
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Phone</th>
                        <th className="px-4 py-2.5">Source</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Assigned To</th>
                        <th className="px-4 py-2.5">Est. Value</th>
                        <th className="px-4 py-2.5">Follow-up</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {leads.map((lead) => {
                        const isOverdue =
                          lead.followUpAt != null &&
                          lead.followUpAt <= now &&
                          !["WON", "LOST", "STALE"].includes(lead.status);
                        return (
                          <tr key={lead.id} className="transition-colors hover:bg-[var(--panel-strong)]/40">
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">
                              <Link
                                href={`/sales/leads/${lead.id}`}
                                className="hover:text-[var(--accent)] hover:underline"
                              >
                                {lead.fullName}
                              </Link>
                              {lead.organization ? (
                                <span className="ml-1.5 text-[11px] text-[var(--ink-muted)]">
                                  {lead.organization}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{lead.phone}</td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">
                              {lead.source.replace(/_/g, " ")}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}
                              >
                                {LEAD_STATUS_LABELS[lead.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">
                              {lead.assignedTo?.name ?? <span className="opacity-40">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">
                              {lead.estimatedValue != null
                                ? formatMoney(lead.estimatedValue, currency)
                                : <span className="opacity-40 font-normal">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {lead.followUpAt ? (
                                <span className={`inline-flex items-center gap-1 text-[12px] ${isOverdue ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                                  {isOverdue && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden>
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                  )}
                                  {formatEATDate(lead.followUpAt)}
                                </span>
                              ) : (
                                <span className="opacity-40 text-[var(--ink-muted)]">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/sales/leads/${lead.id}`}
                                className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pipeline total footer */}
                {leads.some((l) => l.estimatedValue != null) && (
                  <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5">
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {leads.length} lead{leads.length !== 1 ? "s" : ""} shown
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--ink)]">
                      Pipeline:{" "}
                      <span className="text-[var(--accent)]">
                        {formatMoney(
                          leads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0),
                          currency,
                        )}
                      </span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ── QUOTATIONS TAB ──────────────────────────────────────── */
          <div>
            {/* Quotation summary bar */}
            {(quotationStats as { _count: number })._count > 0 && (
              <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] px-4 py-2.5">
                <span className="text-[11px] text-[var(--ink-muted)]">
                  <span className="font-semibold text-[var(--ink)]">
                    {(quotationStats as { _count: number })._count}
                  </span>{" "}
                  quotes ·{" "}
                  <span className="font-semibold text-[var(--ink)]">
                    {formatMoneyCompact(quoteTotal, currency)}
                  </span>{" "}
                  total
                </span>
                <span className="text-[11px] text-[var(--ink-muted)]">
                  Accepted:{" "}
                  <span className="font-semibold text-emerald-600">
                    {formatMoneyCompact(acceptedTotal, currency)}
                  </span>{" "}
                  ({acceptanceRate}%)
                </span>
              </div>
            )}

            {quotations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <p className="text-sm font-medium text-[var(--ink-muted)]">No quotations yet</p>
                {can.createQuotations(user) ? (
                  <Link
                    href="/sales/quotations/new"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Create first quotation
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-[13px]">
                  <thead className="bg-[var(--panel-strong)]/50 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                    <tr className="border-b border-[var(--line)]">
                      <th className="px-4 py-2.5">Quote #</th>
                      <th className="px-4 py-2.5">Client / Lead</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Total</th>
                      <th className="px-4 py-2.5">Created</th>
                      <th className="px-4 py-2.5">Valid Until</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {quotations.map((q) => {
                      const recipientName = q.client?.fullName ?? q.lead?.fullName ?? null;
                      const isExpired =
                        q.status !== "ACCEPTED" &&
                        q.validUntil != null &&
                        q.validUntil < now;
                      return (
                        <tr key={q.id} className="transition-colors hover:bg-[var(--panel-strong)]/40">
                          <td className="px-4 py-3 font-mono text-[12px] font-semibold text-[var(--ink)]">
                            <Link
                              href={`/sales/quotations/${q.id}`}
                              className="hover:text-[var(--accent)] hover:underline"
                            >
                              {q.quoteNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-muted)]">
                            {recipientName ?? <span className="opacity-40">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUOTATION_STATUS_COLORS[q.status] ?? ""}`}
                            >
                              {q.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--ink)]">
                            {formatMoney(q.totalAmount, q.currency)}
                          </td>
                          <td className="px-4 py-3 text-[var(--ink-muted)]">
                            {formatEATDate(q.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            {q.validUntil ? (
                              <span className={`inline-flex items-center gap-1 text-[12px] ${isExpired ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                                {isExpired && (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                  </svg>
                                )}
                                {formatEATDate(q.validUntil)}
                              </span>
                            ) : (
                              <span className="opacity-40 text-[var(--ink-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/sales/quotations/${q.id}`}
                              className="whitespace-nowrap rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
