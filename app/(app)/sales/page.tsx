import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, LeadStatus, LeadSource } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatEATDate } from "@/lib/date-eat";
import { formatMoney, formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { createLead, updateLeadStatus, advanceLeadStageAction } from "./actions";

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
  QUALIFIED:     "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PROPOSAL_SENT: "border-orange-400/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  WON:           "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  LOST:          "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  STALE:         "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT:    "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
  SENT:     "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ACCEPTED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-400",
  EXPIRED:  "border-[var(--line)] bg-[var(--panel-strong)]/60 text-[var(--ink-muted)]",
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
    stageValueGroups,
    sourceStatusGroups,
    overdueLeads,
    lostReasonGroups,
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

    // Stage value breakdown (sum of estimatedValue per status)
    prisma.lead.groupBy({
      by: ["status"],
      where: { ...(onlyOwn ? { assignedToId: user.id } : {}), estimatedValue: { not: null } },
      _sum: { estimatedValue: true },
      _count: { status: true },
    }).catch(() => []),

    // Source win rates (count by source, split WON vs total)
    prisma.lead.groupBy({
      by: ["source", "status"],
      where: { ...(onlyOwn ? { assignedToId: user.id } : {}) },
      _count: { status: true },
    }).catch(() => []),

    // Overdue follow-up leads (for surfacing at top)
    prisma.lead.findMany({
      where: {
        ...(onlyOwn ? { assignedToId: user.id } : {}),
        status: { notIn: ["WON", "LOST", "STALE"] },
        followUpAt: { lte: now },
      },
      select: { id: true, fullName: true, phone: true, status: true, estimatedValue: true, followUpAt: true, assignedTo: { select: { name: true } } },
      orderBy: { followUpAt: "asc" },
      take: 10,
    }).catch(() => []),

    // Lost reason breakdown
    prisma.lead.groupBy({
      by: ["lostReason"],
      where: { ...(onlyOwn ? { assignedToId: user.id } : {}), status: "LOST", lostReason: { not: null } },
      _count: { lostReason: true },
    }).catch(() => []),
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

  // Stage funnel data: count + value per stage
  const stageValueMap = new Map<string, { count: number; value: number }>();
  for (const row of stageValueGroups as Array<{ status: string; _sum: { estimatedValue: number | null }; _count: { status: number } }>) {
    stageValueMap.set(row.status, { count: row._count.status, value: row._sum.estimatedValue ?? 0 });
  }
  // Merge with count-only rows (leads without estimatedValue won't appear in stageValueMap)
  for (const [status, count] of Object.entries(statusCounts)) {
    if (!stageValueMap.has(status)) stageValueMap.set(status, { count: count ?? 0, value: 0 });
    else stageValueMap.set(status, { ...stageValueMap.get(status)!, count: count ?? 0 });
  }

  // Source win rates
  const sourceStats = new Map<string, { total: number; won: number }>();
  for (const row of sourceStatusGroups as Array<{ source: string; status: string; _count: { status: number } }>) {
    const existing = sourceStats.get(row.source) ?? { total: 0, won: 0 };
    sourceStats.set(row.source, {
      total: existing.total + row._count.status,
      won: existing.won + (row.status === "WON" ? row._count.status : 0),
    });
  }
  const sourceWinRates = [...sourceStats.entries()]
    .map(([source, { total, won }]) => ({ source, total, won, rate: total > 0 ? Math.round((won / total) * 100) : 0 }))
    .sort((a, b) => b.won - a.won);

  // Revenue forecast: sum(estimatedValue × stage_probability) for active stages
  const stageProbability: Record<string, number> = {
    NEW: 0.10, CONTACTED: 0.25, QUALIFIED: 0.40, PROPOSAL_SENT: 0.65, WON: 1.0,
  };
  let forecastedRevenue = 0;
  for (const [status, prob] of Object.entries(stageProbability)) {
    const stageData = stageValueMap.get(status);
    if (stageData) forecastedRevenue += stageData.value * prob;
  }

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

  // Next stage in the funnel
  const NEXT_STAGE: Partial<Record<LeadStatus, LeadStatus>> = {
    NEW: "CONTACTED", CONTACTED: "QUALIFIED",
    QUALIFIED: "PROPOSAL_SENT", PROPOSAL_SENT: "WON",
  };

  const LOST_REASONS = ["Price too high", "Chose competitor", "No budget", "Bad timing", "Unreachable", "Other"];

  return (
    <div className="space-y-4">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">CRM</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">Sales</p>
          <p className="text-[11px] text-[var(--ink-muted)]">Leads pipeline and quotations</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "leads" && can.createLeads(user) ? (
            <Link
              href="/sales?tab=leads&newLead=1"
              className="btn-premium rounded-lg px-4 py-2.5 text-[12px] font-bold"
            >
              + New Lead
            </Link>
          ) : null}
          {activeTab === "quotations" && can.createQuotations(user) ? (
            <Link
              href="/sales/quotations/new"
              className="btn-premium rounded-lg px-4 py-2.5 text-[12px] font-bold"
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

      {/* ══════════════════════════════════════════════════════════════════════
          1. VISUAL FUNNEL + FORECAST
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales Funnel</p>
          <p className="text-[11px] font-semibold text-[var(--ink-muted)]">
            Forecast: <span className="text-[var(--accent)]">{formatMoneyCompact(forecastedRevenue, currency)}</span>
          </p>
        </div>
        {/* Stage bars */}
        {(() => {
          const ACTIVE_STAGES = ["NEW","CONTACTED","QUALIFIED","PROPOSAL_SENT"] as const;
          const maxCount = Math.max(1, ...ACTIVE_STAGES.map(s => stageValueMap.get(s)?.count ?? 0));
          const stageColors: Record<string, string> = {
            NEW: "bg-sky-500", CONTACTED: "bg-violet-500",
            QUALIFIED: "bg-amber-500", PROPOSAL_SENT: "bg-orange-500",
          };
          const stageLabels: Record<string, string> = {
            NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL_SENT: "Proposal",
          };
          return (
            <div className="grid grid-cols-4 divide-x divide-[var(--line)] px-0">
              {ACTIVE_STAGES.map((s, i) => {
                const data = stageValueMap.get(s) ?? { count: 0, value: 0 };
                const next = ACTIVE_STAGES[i + 1];
                const nextCount = next ? (stageValueMap.get(next)?.count ?? 0) : 0;
                const dropOff = data.count > 0 && i < ACTIVE_STAGES.length - 1
                  ? Math.round(((data.count - nextCount) / data.count) * 100)
                  : null;
                const barWidth = Math.max(4, Math.round((data.count / maxCount) * 100));
                return (
                  <Link key={s} href={`/sales?tab=leads&status=${s}`}
                    className="group flex flex-col gap-1.5 p-3 transition hover:bg-[var(--panel-strong)]">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="text-lg font-black text-[var(--ink)]">{data.count}</p>
                      {dropOff !== null && dropOff > 0 && (
                        <span className="text-[9px] font-bold text-red-500">-{dropOff}%</span>
                      )}
                    </div>
                    {/* Bar */}
                    <div className="h-1.5 w-full rounded-full bg-[var(--panel-strong)]">
                      <div className={`h-full rounded-full ${stageColors[s]} transition-all`} style={{ width: `${barWidth}%` }} />
                    </div>
                    <p className="text-[10px] font-medium text-[var(--ink-muted)]">{stageLabels[s]}</p>
                    {data.value > 0 && (
                      <p className="text-[9px] font-semibold text-[var(--accent)]">{formatMoneyCompact(data.value, currency)}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })()}
        {/* Won / Lost summary row */}
        <div className="flex divide-x divide-[var(--line)] border-t border-[var(--line)]">
          {(["WON","LOST","STALE"] as const).map(s => {
            const data = stageValueMap.get(s) ?? { count: 0, value: 0 };
            const color = s === "WON" ? "text-emerald-600" : s === "LOST" ? "text-red-500" : "text-[var(--ink-muted)]";
            const label = s === "WON" ? "Won" : s === "LOST" ? "Lost" : "Stale";
            return (
              <Link key={s} href={`/sales?tab=leads&status=${s}`}
                className="flex flex-1 items-center justify-center gap-2 py-2 text-center transition hover:bg-[var(--panel-strong)]">
                <p className={`text-sm font-black ${color}`}>{data.count}</p>
                <p className="text-[10px] text-[var(--ink-muted)]">{label}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          2. TODAY'S FOLLOW-UPS (shown only when there are overdue leads)
      ══════════════════════════════════════════════════════════════════════ */}
      {(overdueLeads as Array<{ id: string; fullName: string; phone: string; status: string; estimatedValue: number | null; followUpAt: Date | null; assignedTo: { name: string } | null }>).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/6">
          <div className="flex items-center justify-between border-b border-amber-500/20 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {followupsDue} Follow-up{followupsDue !== 1 ? "s" : ""} Overdue
              </p>
            </div>
            <Link href="/sales?tab=leads&overdue=1" className="text-[11px] font-semibold text-[var(--accent)]">See all →</Link>
          </div>
          <div className="divide-y divide-amber-500/10">
            {(overdueLeads as Array<{ id: string; fullName: string; phone: string; status: string; estimatedValue: number | null; followUpAt: Date | null; assignedTo: { name: string } | null }>).map(lead => (
              <Link key={lead.id} href={`/sales/leads/${lead.id}`}
                className="flex items-center justify-between px-4 py-2.5 transition hover:bg-amber-500/8">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{lead.fullName}</p>
                  <p className="text-[10px] text-amber-600">
                    {lead.followUpAt ? `${Math.floor((Date.now() - new Date(lead.followUpAt).getTime()) / 86400000)}d overdue` : "Overdue"}
                    {lead.assignedTo ? ` · ${lead.assignedTo.name}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {lead.estimatedValue ? <p className="text-[12px] font-bold text-[var(--ink)]">{formatMoneyCompact(lead.estimatedValue, currency)}</p> : null}
                  <p className="text-[10px] font-medium capitalize text-[var(--ink-muted)]">{lead.status.toLowerCase().replace("_", " ")}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          3. SOURCE WIN RATES + LOST REASONS
      ══════════════════════════════════════════════════════════════════════ */}
      {sourceWinRates.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Source win rates */}
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Win Rate by Source</p>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {sourceWinRates.map(({ source, total, won, rate }) => (
                <div key={source} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[var(--ink)] capitalize">{source.toLowerCase().replace("_", " ")}</p>
                      <span className={`text-[11px] font-black ${rate >= 50 ? "text-emerald-600" : rate >= 25 ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>{rate}%</span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded-full bg-[var(--panel-strong)]">
                      <div className={`h-full rounded-full ${rate >= 50 ? "bg-emerald-500" : rate >= 25 ? "bg-amber-500" : "bg-[var(--line)]"}`} style={{ width: `${rate}%` }} />
                    </div>
                    <p className="mt-0.5 text-[9px] text-[var(--ink-muted)]">{won} won / {total} total</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lost reasons */}
          {(lostReasonGroups as Array<{ lostReason: string | null; _count: { lostReason: number } }>).length > 0 && (
            <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Why Leads Are Lost</p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {(lostReasonGroups as Array<{ lostReason: string | null; _count: { lostReason: number } }>).map(({ lostReason, _count }) => (
                  <div key={lostReason ?? "other"} className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-[12px] font-medium text-[var(--ink)]">{lostReason ?? "No reason given"}</p>
                    <span className="text-[12px] font-bold text-red-500">{_count.lostReason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          4. LEADS + QUOTATIONS TABS (with quick-advance + lost reason)
      ══════════════════════════════════════════════════════════════════════ */}
      {/* ── SEARCH + TABS ──────────────────────────────────────────────────── */}
      <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)]">

        {/* Tab row + search */}
        <div className="border-b border-[var(--line)]">
          <div className="flex items-center justify-between pr-3">
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
            {/* Search – inline on sm+ */}
            <form method="GET" className="hidden items-center gap-1.5 sm:flex">
              <input type="hidden" name="tab" value={activeTab} />
              <input
                name="q"
                defaultValue={searchQ}
                placeholder={activeTab === "leads" ? "Search name, phone…" : "Search quote # or name…"}
                className="w-40 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]/50"
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
          {/* Search – full-width row on mobile */}
          <div className="px-3 pb-2 pt-1.5 sm:hidden">
            <form method="GET" className="flex items-center gap-1.5">
              <input type="hidden" name="tab" value={activeTab} />
              <input
                name="q"
                defaultValue={searchQ}
                placeholder={activeTab === "leads" ? "Search name, phone…" : "Search quote # or name…"}
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs outline-none transition focus:border-[var(--accent)]/50"
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
                  <p className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
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
                      className="btn-premium rounded-lg px-4 py-2 text-[12px] font-bold"
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
                {/* ── Mobile lead cards ── */}
                <div className="divide-y divide-[var(--line)] lg:hidden">
                  {leads.map((lead) => {
                    const isOverdue = lead.followUpAt != null && lead.followUpAt <= now && !["WON", "LOST", "STALE"].includes(lead.status);
                    const nextStage = NEXT_STAGE[lead.status as LeadStatus];
                    const isTerminal = ["WON","LOST","STALE"].includes(lead.status);
                    return (
                      <div key={`m-${lead.id}`} className="border-b border-[var(--line)] last:border-b-0">
                        <Link href={`/sales/leads/${lead.id}`} className="block px-4 py-3 transition-colors active:bg-[var(--panel-strong)]/40">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-[14px] font-semibold text-[var(--ink)]">{lead.fullName}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}>
                              {LEAD_STATUS_LABELS[lead.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                            <span>{lead.phone}</span>
                            {lead.organization ? <><span className="opacity-40">·</span><span className="truncate">{lead.organization}</span></> : null}
                          </div>
                          {(lead.estimatedValue != null || lead.followUpAt) && (
                            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                              {lead.estimatedValue != null && <span className="font-semibold text-[var(--ink)]">{formatMoney(lead.estimatedValue, currency)}</span>}
                              {lead.followUpAt && (
                                <span className={`flex items-center gap-0.5 ${isOverdue ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                                  {isOverdue && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                                  {formatEATDate(lead.followUpAt)}
                                </span>
                              )}
                            </div>
                          )}
                        </Link>
                        {/* Quick-advance action strip */}
                        {!isTerminal && (
                          <div className="flex items-center gap-2 border-t border-[var(--line)]/50 px-4 pb-2.5 pt-2">
                            {nextStage && (
                              <form action={advanceLeadStageAction} className="flex-1">
                                <input type="hidden" name="leadId" value={lead.id} />
                                <input type="hidden" name="newStatus" value={nextStage} />
                                <button type="submit" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition active:opacity-70">
                                  → {LEAD_STATUS_LABELS[nextStage]}
                                </button>
                              </form>
                            )}
                            <details className="shrink-0">
                              <summary className="cursor-pointer list-none rounded-lg border border-red-500/30 bg-red-500/8 px-2.5 py-1 text-[11px] font-semibold text-red-600 [&::-webkit-details-marker]:hidden">
                                Mark Lost
                              </summary>
                              <div className="absolute z-20 mt-1 w-56 rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-lg">
                                <form action={advanceLeadStageAction} className="p-2 space-y-1.5">
                                  <input type="hidden" name="leadId" value={lead.id} />
                                  <input type="hidden" name="newStatus" value="LOST" />
                                  <p className="px-1 text-[10px] font-semibold text-[var(--ink-muted)]">Why was this lead lost?</p>
                                  <select name="lostReason" className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-[12px] outline-none">
                                    <option value="">Select reason</option>
                                    {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <button type="submit" className="w-full rounded-lg bg-red-500 py-1.5 text-[12px] font-bold text-white">Confirm Lost</button>
                                </form>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* ── Desktop leads table ── */}
                <div className="hidden overflow-x-auto lg:block">
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
                        const isOverdue = lead.followUpAt != null && lead.followUpAt <= now && !["WON", "LOST", "STALE"].includes(lead.status);
                        return (
                          <tr key={`d-${lead.id}`} className="transition-colors hover:bg-[var(--panel-strong)]/40">
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">
                              <Link href={`/sales/leads/${lead.id}`} className="hover:text-[var(--accent)] hover:underline">{lead.fullName}</Link>
                              {lead.organization ? <span className="ml-1.5 text-[11px] text-[var(--ink-muted)]">{lead.organization}</span> : null}
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{lead.phone}</td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{lead.source.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}>
                                {LEAD_STATUS_LABELS[lead.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{lead.assignedTo?.name ?? <span className="opacity-40">—</span>}</td>
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">
                              {lead.estimatedValue != null ? formatMoney(lead.estimatedValue, currency) : <span className="opacity-40 font-normal">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {lead.followUpAt ? (
                                <span className={`inline-flex items-center gap-1 text-[12px] ${isOverdue ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                                  {isOverdue && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                                  {formatEATDate(lead.followUpAt)}
                                </span>
                              ) : <span className="opacity-40 text-[var(--ink-muted)]">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!["WON","LOST","STALE"].includes(lead.status) && NEXT_STAGE[lead.status as LeadStatus] && (
                                  <form action={advanceLeadStageAction}>
                                    <input type="hidden" name="leadId" value={lead.id} />
                                    <input type="hidden" name="newStatus" value={NEXT_STAGE[lead.status as LeadStatus]!} />
                                    <button type="submit" className="whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
                                      → {LEAD_STATUS_LABELS[NEXT_STAGE[lead.status as LeadStatus]!]}
                                    </button>
                                  </form>
                                )}
                                <Link href={`/sales/leads/${lead.id}`} className="btn-premium-secondary whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold">Open</Link>
                              </div>
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
              <>
                {/* ── Mobile quotation cards ── */}
                <div className="divide-y divide-[var(--line)] lg:hidden">
                  {quotations.map((q) => {
                    const recipientName = q.client?.fullName ?? q.lead?.fullName ?? null;
                    const isExpired = q.status !== "ACCEPTED" && q.validUntil != null && q.validUntil < now;
                    return (
                      <Link key={`m-${q.id}`} href={`/sales/quotations/${q.id}`} className="block px-4 py-3 transition-colors hover:bg-[var(--panel-strong)]/40">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-mono text-[13px] font-bold text-[var(--ink)]">{q.quoteNumber}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUOTATION_STATUS_COLORS[q.status] ?? ""}`}>{q.status}</span>
                        </div>
                        {recipientName && <p className="text-[12px] text-[var(--ink-muted)]">{recipientName}</p>}
                        <div className="mt-1 flex items-center gap-3 text-[11px]">
                          <span className="font-semibold text-[var(--ink)]">{formatMoney(q.totalAmount, q.currency)}</span>
                          {q.validUntil && (
                            <span className={`flex items-center gap-0.5 ${isExpired ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                              {isExpired && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                              valid to {formatEATDate(q.validUntil)}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {/* ── Desktop quotations table ── */}
                <div className="hidden overflow-x-auto lg:block">
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
                        const isExpired = q.status !== "ACCEPTED" && q.validUntil != null && q.validUntil < now;
                        return (
                          <tr key={`d-${q.id}`} className="transition-colors hover:bg-[var(--panel-strong)]/40">
                            <td className="px-4 py-3 font-mono text-[12px] font-semibold text-[var(--ink)]">
                              <Link href={`/sales/quotations/${q.id}`} className="hover:text-[var(--accent)] hover:underline">{q.quoteNumber}</Link>
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{recipientName ?? <span className="opacity-40">—</span>}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUOTATION_STATUS_COLORS[q.status] ?? ""}`}>{q.status}</span>
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--ink)]">{formatMoney(q.totalAmount, q.currency)}</td>
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{formatEATDate(q.createdAt)}</td>
                            <td className="px-4 py-3">
                              {q.validUntil ? (
                                <span className={`inline-flex items-center gap-1 text-[12px] ${isExpired ? "font-semibold text-red-600" : "text-[var(--ink-muted)]"}`}>
                                  {isExpired && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0" aria-hidden><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                                  {formatEATDate(q.validUntil)}
                                </span>
                              ) : <span className="opacity-40 text-[var(--ink-muted)]">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link href={`/sales/quotations/${q.id}`} className="btn-premium-secondary whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold">Open</Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
