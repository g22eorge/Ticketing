export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { MonthSelectForm } from "@/components/shared/MonthSelectForm";
import { TechnicianBarChart } from "@/components/reports/ReportsCharts";
import { MobileActivityFeed } from "@/components/reports/MobileActivityFeed";
import { getClientBill, getExternalTechBill, resolveTechCost } from "@/lib/billing";
import { formatMoneyCompact, toBaseAmount } from "@/lib/currency";
import { formatEATMonthLabel } from "@/lib/date-eat";
import { loadBilledTotals, loadCashCollectionsByChannel, loadReceivablesTotal } from "@/lib/finance/reconciliation";
import { UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { requireModule, OrgModule } from "@/lib/module-access";

type SearchParams = { month?: string; year?: string; period?: string; tab?: string };

function parseMonth(monthParam?: string) {
  if (!monthParam) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const [y, m] = monthParam.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: y, month: m };
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function yearRange(year: number) {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end };
}

function monthLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthSequence(endYear: number, endMonth: number, count: number) {
  return Array.from({ length: count }, (_, idx) => {
    const d = new Date(endYear, endMonth - 1 - (count - 1 - idx), 1);
    return {
      key: monthLabel(d.getFullYear(), d.getMonth() + 1),
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  });
}

function monthOptions(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = monthLabel(date.getFullYear(), date.getMonth() + 1);
    const label = formatEATMonthLabel(date.getFullYear(), date.getMonth() + 1);
    return { value, label };
  });
}

function yearOptions(startYear: number, endYear: number) {
  const safeStart = Math.min(startYear, endYear);
  const safeEnd = Math.max(startYear, endYear);
  const out: Array<{ value: string; label: string }> = [];
  for (let year = safeEnd; year >= safeStart; year--) {
    out.push({ value: String(year), label: `${year} Annual Package` });
  }
  return out;
}

const statusLabel: Record<ReturnType<typeof normalizeJobStatus>, string> = {
  RECEIVED: "Received",
  DIAGNOSING: "Diagnosing",
  REFERRED: "Referred",
  AWAITING_APPROVAL: "Awaiting Approval",
  IN_REPAIR: "In Repair",
  READY_FOR_PICKUP: "Ready for Pickup",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

const deviceLabel: Record<string, string> = {
  PHONE_ANDROID: "Android Phone",
  PHONE_IPHONE: "iPhone",
  TABLET: "Tablet",
  WINDOWS_PC: "Windows PC",
  MAC: "Mac",
  OTHER: "Other",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule(OrgModule.REPORTS);
  const filters = await searchParams;
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewAccountsSummary(user)) redirect("/dashboard");

  const period: "month" | "year" = filters.period === "year" ? "year" : "month";
  const tab = ["business", "operations", "commercial", "team"].includes(filters.tab ?? "")
    ? (filters.tab as "business" | "operations" | "commercial" | "team")
    : "business";
  const selectedMonth = parseMonth(filters.month);
  const selectedYear = Number(filters.year) || new Date().getFullYear();
  const selectedRange =
    period === "year"
      ? yearRange(selectedYear)
      : monthRange(selectedMonth.year, selectedMonth.month);
  const prevRange =
    period === "year"
      ? yearRange(selectedYear - 1)
      : monthRange(
          new Date(selectedMonth.year, selectedMonth.month - 2, 1).getFullYear(),
          new Date(selectedMonth.year, selectedMonth.month - 2, 1).getMonth() + 1,
        );
  const currency = org.baseCurrency;
  const selectedMonthString =
    period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
  const trendNow = new Date();
  const trendMonths = monthSequence(trendNow.getFullYear(), trendNow.getMonth() + 1, trendNow.getMonth() + 1);

  const [
    statusGroup,
    completedAll,
    completedSelected,
    completedPrev,
    openJobs,
    externalCount,
    inHouseCount,
    _externalPayoutOutstandingJobs,
    paidExternalJobs,
    earliestJob,
    latestJob,
    techPerfJobsRaw,
    approvalDelayJobs,
    salesByPeriod,
    _invoicesByPeriod,
    salesTargetsForPeriod,
    staffJobRevenue,
    leadFunnel,
    lowStockParts,
    supplierBillsAgg,
    expensesMtd,
    _trendJobs,
    jobsInSelectedPeriod,
  ] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { orgId }, _count: { status: true } }),
    prisma.job.findMany({
      where: { orgId, status: "COMPLETED" },
      select: { completedAt: true, receivedAt: true, diagnosisNotes: true, externalDiagnosis: true },
    }),
    prisma.job.findMany({
      where: { orgId, status: "COMPLETED", completedAt: { gte: selectedRange.start, lte: selectedRange.end } },
    }),
    prisma.job.findMany({
      where: { orgId, status: "COMPLETED", completedAt: { gte: prevRange.start, lte: prevRange.end } },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        status: {
          in: filterSupportedJobStatuses([
            "RECEIVED",
            "DIAGNOSING",
            "REFERRED",
            "AWAITING_APPROVAL",
            "IN_REPAIR",
            "READY_FOR_PICKUP",
          ]) as JobStatus[],
        },
      },
      select: { jobNumber: true, status: true, receivedAt: true, updatedAt: true },
    }),
    prisma.job.count({
      where: {
        orgId,
        repairPath: "EXTERNAL",
        status: "COMPLETED",
        completedAt: { gte: selectedRange.start, lte: selectedRange.end },
      },
    }),
    prisma.job.count({
      where: {
        orgId,
        repairPath: "IN_HOUSE",
        status: "COMPLETED",
        completedAt: { gte: selectedRange.start, lte: selectedRange.end },
      },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        repairPath: "EXTERNAL",
        status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] as JobStatus[] },
      },
      select: { id: true, externalTechBill: true },
    }),
    prisma.job.findMany({
      where: { orgId, externalPaid: true, externalPaidAt: { gte: selectedRange.start, lte: selectedRange.end } },
      select: { externalTechFee: true, externalTechBill: true },
    }),
    prisma.job.findFirst({ where: { orgId }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
    prisma.job.findFirst({ where: { orgId }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    prisma.job.findMany({
      where: {
        orgId,
        receivedAt: { gte: selectedRange.start, lte: selectedRange.end },
        assignedToId: { not: null },
      },
      select: {
        status: true,
        completedAt: true,
        receivedAt: true,
        clientBill: true,
        externalTechBill: true,
        assignedTo: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.job.findMany({
      where: { orgId, status: "AWAITING_APPROVAL" },
      select: {
        id: true,
        jobNumber: true,
        receivedAt: true,
        updatedAt: true,
        brand: true,
        model: true,
        deviceType: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
    }),
    prisma.sale
      .findMany({
        where: { orgId, status: "PAID", paidAt: { gte: selectedRange.start, lte: selectedRange.end } },
        select: { totalAmount: true, createdById: true, createdBy: { select: { id: true, name: true } } },
      })
      .catch(() => [] as Array<{ totalAmount: number; createdById: string | null; createdBy: { id: string; name: string } | null }>),
    prisma.invoice
      .findMany({
        where: { orgId, status: "PAID", paidAt: { gte: selectedRange.start, lte: selectedRange.end } },
        select: {
          totalAmount: true,
          job: { select: { createdById: true, createdBy: { select: { id: true, name: true } } } },
        },
      })
      .catch(
        () =>
          [] as Array<{
            totalAmount: number;
            job: { createdById: string | null; createdBy: { id: string; name: string } | null } | null;
          }>,
      ),
    prisma.salesTarget.findMany({ where: { orgId, period: selectedMonthString } }).catch(() => [] as Array<{ userId: string | null; targetRevenue: number; period: string }>),
    prisma.job
      .findMany({
        where: {
          orgId,
          status: "COMPLETED",
          completedAt: { gte: selectedRange.start, lte: selectedRange.end },
        },
        select: {
          clientBill: true,
          externalTechBill: true,
          createdById: true,
          createdBy: { select: { id: true, name: true } },
        },
      })
      .catch(() => [] as Array<{ clientBill: number | null; externalTechBill: number | null; createdById: string | null; createdBy: { id: string; name: string } | null }>),
    prisma.lead
      .groupBy({ by: ["status"], where: { orgId }, _count: { status: true } })
      .catch(() => [] as Array<{ status: string; _count: { status: number } }>),
    prisma.part
      .findMany({
        where: { orgId, isActive: true, reorderLevel: { gt: 0 } },
        select: { name: true, sku: true, qtyOnHand: true, reorderLevel: true, unitCost: true },
      })
      .catch(() => [] as Array<{ name: string; sku: string | null; qtyOnHand: number; reorderLevel: number; unitCost: number | null }>),
    prisma.supplierBill
      .aggregate({
        where: { orgId, status: { in: ["POSTED", "PART_PAID"] } },
        _sum: { totalAmount: true, paidAmount: true },
      })
      .catch(() => ({ _sum: { totalAmount: null as number | null, paidAmount: null as number | null } })),
    prisma.expense
      .findMany({
        where: { orgId, paidAt: { gte: selectedRange.start, lte: selectedRange.end } },
        select: { amount: true },
      })
      .catch(() => [] as Array<{ amount: number }>),
    prisma.job.findMany({
      where: { orgId, receivedAt: { gte: trendMonths[0].start, lte: trendMonths[trendMonths.length - 1].end } },
      select: { deviceType: true, receivedAt: true },
    }),
    prisma.job.findMany({
      where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
      select: {
        deviceType: true,
        status: true,
        receivedAt: true,
        completedAt: true,
        repairPath: true,
        assignedTo: { select: { name: true } },
        clientBill: true,
        externalTechBill: true,
      },
    }),
  ]);

  const payments = await prisma.payment
    .findMany({
      where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
      select: { amount: true, currency: true, exchangeRateToBase: true },
    })
    .catch(() => [] as Array<{ amount: number; currency: string | null; exchangeRateToBase: number | null }>);

  const refunds = await prisma.refund
    .findMany({
      where: { orgId, refundedAt: { gte: selectedRange.start, lte: selectedRange.end } },
      select: { amount: true, currency: true, exchangeRateToBase: true },
    })
    .catch(() => [] as Array<{ amount: number; currency: string | null; exchangeRateToBase: number | null }>);

  const [collectionsByChannel, billedByChannel] = await Promise.all([
    loadCashCollectionsByChannel({ orgId, baseCurrency: org.baseCurrency, range: selectedRange }).catch(() => ({ repairs: 0, products: 0, corporate: 0, unallocated: 0, total: 0 })),
    loadBilledTotals({ orgId, range: selectedRange }).catch(() => ({ repairs: 0, products: 0, corporate: 0, total: 0 })),
  ]);

  const [receivables, newClientsCount, quotationsByStatus] = await Promise.all([
    loadReceivablesTotal(orgId).catch(() => ({ invoiceBalance: 0, saleBalance: 0, total: 0, invoiceCount: 0, saleCount: 0 })),
    prisma.client.count({ where: { orgId, createdAt: { gte: selectedRange.start, lte: selectedRange.end } } }).catch(() => 0),
    prisma.quotation
      .groupBy({ by: ["status"], where: { orgId, createdAt: { gte: selectedRange.start, lte: selectedRange.end } }, _count: { status: true } })
      .catch(() => [] as Array<{ status: string; _count: { status: number } }>),
  ]);

  // ─── COMPUTE ────────────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();
  const minYear = earliestJob?.receivedAt?.getFullYear() ?? currentYear;
  const maxYear = Math.max(currentYear, latestJob?.receivedAt?.getFullYear() ?? currentYear);
  const selectableMonths = period === "year" ? yearOptions(minYear, maxYear) : monthOptions(18);

  const revenueFor = (jobs: typeof completedSelected) =>
    jobs.filter((j) => getClientBill(j) !== null).reduce((s, j) => s + (getClientBill(j) ?? 0), 0);
  const revenueSelected = revenueFor(completedSelected);
  const revenuePrev = revenueFor(completedPrev);
  const revenueDelta = revenueSelected - revenuePrev;
  const marginSelected = completedSelected
    .filter((j) => getClientBill(j) !== null)
    .reduce((s, j) => s + ((getClientBill(j) ?? 0) - (getExternalTechBill(j) ?? 0)), 0);

  const cashIn = payments.reduce(
    (s, p) =>
      s +
      toBaseAmount({
        amount: p.amount,
        currency: p.currency,
        baseCurrency: org.baseCurrency,
        exchangeRateToBase: p.exchangeRateToBase,
      }),
    0,
  );
  const cashOutRefunds = refunds.reduce(
    (s, r) =>
      s +
      toBaseAmount({
        amount: r.amount,
        currency: r.currency,
        baseCurrency: org.baseCurrency,
        exchangeRateToBase: r.exchangeRateToBase,
      }),
    0,
  );
  const cashOutExternal = paidExternalJobs.reduce(
    (s, j) => s + resolveTechCost(j.externalTechFee, j.externalTechBill),
    0,
  );
  const cashNet = cashIn - cashOutExternal - cashOutRefunds;

  const statusCount = new Map(
    statusGroup.map((s) => [normalizeJobStatus(s.status as JobStatus), s._count.status]),
  );
  const statusData = UI_JOB_STATUSES.map((status) => ({
    key: status,
    name: statusLabel[status],
    value: statusCount.get(status) ?? 0,
  }));

  const avgTurnaround = (() => {
    const vals = completedAll
      .filter((j) => j.completedAt)
      .map((j) => (j.completedAt!.getTime() - j.receivedAt.getTime()) / 36e5);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  })();

  const nowTs = new Date();
  const delayedJobs = openJobs
    .map((j) => ({ ...j, ageDays: Math.floor((nowTs.getTime() - j.receivedAt.getTime()) / 86400000) }))
    .filter((j) => j.ageDays >= 3)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 8);

  const approvalDelays = approvalDelayJobs.map((j) => ({
    ...j,
    daysPending: Math.floor((nowTs.getTime() - j.updatedAt.getTime()) / 86400000),
  }));

  // Tech perf
  const techPerfMap = new Map<
    string,
    {
      name: string;
      role: string;
      total: number;
      completed: number;
      turnaroundSum: number;
      turnaroundCount: number;
      revenue: number;
    }
  >();
  for (const job of techPerfJobsRaw) {
    if (!job.assignedTo) continue;
    const e = techPerfMap.get(job.assignedTo.id) ?? {
      name: job.assignedTo.name,
      role: job.assignedTo.role,
      total: 0,
      completed: 0,
      turnaroundSum: 0,
      turnaroundCount: 0,
      revenue: 0,
    };
    e.total += 1;
    if (job.status === "COMPLETED") {
      e.completed += 1;
      if (job.completedAt) {
        e.turnaroundSum += (job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5;
        e.turnaroundCount += 1;
      }
      const bill = getClientBill(job);
      if (typeof bill === "number") e.revenue += bill;
    }
    techPerfMap.set(job.assignedTo.id, e);
  }
  const techPerf = [...techPerfMap.values()]
    .map((t) => ({
      ...t,
      completionRate: t.total > 0 ? (t.completed / t.total) * 100 : 0,
      avgTurnaround: t.turnaroundCount > 0 ? t.turnaroundSum / t.turnaroundCount : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Revenue channels
  const repairCollectionsTotal = collectionsByChannel.repairs;
  const posSalesTotal = collectionsByChannel.products;
  const invoicesPaidTotal = collectionsByChannel.corporate + collectionsByChannel.unallocated;
  const totalAllChannels = collectionsByChannel.total;
  const totalBilledAllChannels = billedByChannel.total;
  const expensesTotal = expensesMtd.reduce((s, e) => s + e.amount, 0);

  // P&L derived
  const grossProfit = totalAllChannels - cashOutExternal;
  const grossMarginPct = totalAllChannels > 0 ? Math.round((grossProfit / totalAllChannels) * 100) : 0;
  const netProfit = grossProfit - expensesTotal - cashOutRefunds;

  // Quotation pipeline
  const quotationCountMap = new Map<string, number>();
  for (const row of quotationsByStatus) quotationCountMap.set(row.status, row._count.status);
  const quotationsSent = (quotationCountMap.get("SENT") ?? 0) + (quotationCountMap.get("DRAFT") ?? 0);
  const quotationsApproved = quotationCountMap.get("APPROVED") ?? 0;
  const quotationsExpired = quotationCountMap.get("EXPIRED") ?? 0;
  const quotationTotal = quotationsSent + quotationsApproved;
  const quotationConversionPct = quotationTotal > 0 ? Math.round((quotationsApproved / quotationTotal) * 100) : 0;

  // Staff revenue
  const staffRevenueMap = new Map<
    string,
    { name: string; repairRev: number; posRev: number; invoiceRev: number; total: number; target: number }
  >();
  for (const j of staffJobRevenue) {
    if (!j.createdById || !j.createdBy) continue;
    const e = staffRevenueMap.get(j.createdById) ?? {
      name: j.createdBy.name,
      repairRev: 0,
      posRev: 0,
      invoiceRev: 0,
      total: 0,
      target: 0,
    };
    e.repairRev += getClientBill(j) ?? 0;
    e.total = e.repairRev + e.posRev + e.invoiceRev;
    staffRevenueMap.set(j.createdById, e);
  }
  for (const s of salesByPeriod) {
    if (!s.createdById || !s.createdBy) continue;
    const e = staffRevenueMap.get(s.createdById) ?? {
      name: s.createdBy.name,
      repairRev: 0,
      posRev: 0,
      invoiceRev: 0,
      total: 0,
      target: 0,
    };
    e.posRev += s.totalAmount;
    e.total = e.repairRev + e.posRev + e.invoiceRev;
    staffRevenueMap.set(s.createdById, e);
  }
  for (const t of salesTargetsForPeriod) {
    if (!t.userId) continue;
    const e = staffRevenueMap.get(t.userId);
    if (e) {
      e.target = t.targetRevenue;
      staffRevenueMap.set(t.userId, e);
    }
  }
  const staffRevRows = [...staffRevenueMap.values()].sort((a, b) => b.total - a.total);
  const teamTarget = salesTargetsForPeriod.find((t) => !t.userId);
  const teamTargetRevenue = teamTarget?.targetRevenue ?? 0;
  const teamTargetPct =
    teamTargetRevenue > 0 ? Math.round((totalAllChannels / teamTargetRevenue) * 100) : null;

  // Device insights
  const deviceMap = new Map<string, { total: number; completed: number; revenue: number }>();
  for (const job of jobsInSelectedPeriod) {
    const d = deviceLabel[job.deviceType] ?? job.deviceType;
    const e = deviceMap.get(d) ?? { total: 0, completed: 0, revenue: 0 };
    e.total += 1;
    if (job.status === "COMPLETED") {
      e.completed += 1;
      const b = getClientBill(job);
      if (typeof b === "number") e.revenue += b;
    }
    deviceMap.set(d, e);
  }
  const deviceRows = [...deviceMap.entries()]
    .map(([device, v]) => ({
      device,
      ...v,
      completionRate: v.total > 0 ? (v.completed / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Fault keywords
  const STOP_WORDS = new Set([
    "about", "after", "also", "before", "being", "between", "could", "during",
    "every", "found", "having", "large", "later", "least", "might", "never",
    "often", "other", "place", "quite", "rather", "since", "small", "still",
    "their", "there", "these", "thing", "think", "those", "three", "through",
    "under", "until", "using", "which", "while", "whose", "would", "where",
    "when", "then", "them", "than", "should", "machine", "device", "phone",
    "client", "customer", "repair", "technician", "laptop", "computer", "tablet",
    "unit", "issue", "problem", "service", "parts", "spare", "component",
    "check", "checked", "testing", "working", "replace", "replaced", "repaired",
    "confirmed", "reported", "returned", "failed", "failure", "faulty", "damaged",
    "broken", "bicoz", "becoz", "enters", "enter", "makes", "takes", "turns",
    "comes", "gives", "shows", "brings", "wants", "tries", "start", "stops",
    "works", "opens", "close", "power", "press", "click", "touch", "boots",
  ]);
  const commonFaults = (() => {
    const source = completedAll
      .map((j) => `${j.diagnosisNotes ?? ""} ${j.externalDiagnosis ?? ""}`)
      .join(" ")
      .toLowerCase();
    const tokens = source
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 5 && !STOP_WORDS.has(w));
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  // Inventory
  const lowStockItems = lowStockParts.filter((p) => p.qtyOnHand <= p.reorderLevel);
  const totalStockValue = lowStockParts.reduce((s, p) => s + p.qtyOnHand * (p.unitCost ?? 0), 0);
  const payablesOutstanding =
    (supplierBillsAgg._sum.totalAmount ?? 0) - (supplierBillsAgg._sum.paidAmount ?? 0);

  // Leads
  const leadCountMap = new Map<string, number>();
  for (const row of leadFunnel) leadCountMap.set(row.status, row._count.status);
  const totalLeads = [...leadCountMap.values()].reduce((s, v) => s + v, 0);
  const wonLeads = leadCountMap.get("WON") ?? 0;
  const leadConversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  // Export items per tab — permission-gated
  const businessExports = [
    ...(can.runFinancialReports(user) ? [{ title: "Expenses", caption: "All expenses paid this period", href: `/api/reports/export?type=expenses&month=${selectedMonthString}` }] : []),
    ...(can.approveInvoices(user) ? [{ title: "Invoices", caption: "All invoices issued this period", href: `/api/reports/export?type=invoices&month=${selectedMonthString}` }] : []),
  ];
  const operationsExports = [
    { title: "Pipeline Aging", caption: "Open jobs by status and age band", href: "/api/reports/export?type=pipeline-aging" },
    { title: "Device Performance", caption: "Completion, margin and turnaround by device", href: `/api/reports/export?type=device-performance&month=${selectedMonthString}` },
    ...(can.runFinancialReports(user) ? [{ title: "Repair Margin", caption: "Job-level client bill vs tech cost", href: `/api/reports/export?type=revenue-variance&month=${selectedMonthString}` }] : []),
    ...(can.reviewExternalBills(user) ? [{ title: "External Payouts", caption: "Outstanding and paid external tech fees", href: "/api/reports/export?type=external-payouts" }] : []),
    ...(can.manageInventory(user) ? [{ title: "Stock Levels", caption: "All active parts with qty and stock status", href: "/api/reports/export?type=inventory-stock" }] : []),
  ];
  const commercialExports = [
    ...(can.viewAllSales(user) ? [{ title: "POS Sales", caption: "Paid point-of-sale transactions", href: `/api/reports/export?type=pos-sales&month=${selectedMonthString}` }] : []),
    ...(can.viewAllSales(user) ? [{ title: "Staff Sales", caption: "Revenue by staff member with targets", href: `/api/reports/export?type=staff-sales&month=${selectedMonthString}` }] : []),
    ...(can.viewAllSales(user) || can.createLeads(user) ? [{ title: "Leads", caption: "All leads with status and estimated value", href: "/api/reports/export?type=leads" }] : []),
  ];
  const teamExports = [
    { title: "Technician Performance", caption: "Throughput and completion per technician", href: "/api/reports/export?type=technician-performance" },
  ];

  // Tab nav helper
  const tabHref = (t: string) =>
    `/reports?period=${period}&${period === "year" ? `year=${selectedYear}` : `month=${selectedMonthString}`}&tab=${t}`;

  const TABS = [
    { key: "business",    label: "Business Health" },
    { key: "operations",  label: "Operations" },
    { key: "commercial",  label: "Commercial" },
    { key: "team",        label: "Team" },
  ] as const;

  const turnaroundLabel = (hrs: number) => {
    if (hrs < 24) return `${Math.round(hrs)}h`;
    return `${Math.floor(hrs / 24)}d ${Math.floor(hrs % 24)}h`;
  };

  const ExportGrid = ({ items }: { items: { title: string; caption: string; href: string }[] }) => (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Downloads</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <a key={item.href} href={item.href}
            className="flex flex-col rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3 transition hover:border-[var(--accent)]/40 hover:bg-[var(--panel)]">
            <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{item.caption}</p>
            <p className="mt-2 text-[12px] font-semibold text-[var(--accent)]">↓ Download CSV</p>
          </a>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {/* ── MOBILE ACTIVITY FEED (lg:hidden) ───────────────────────────────── */}
      <MobileActivityFeed orgId={orgId} />

      {/* ── MOBILE METRICS SUMMARY (lg:hidden) ──────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[var(--ink)]">Reports</h2>
          <span className="text-xs font-medium text-[var(--ink-muted)]">{selectedMonthString}</span>
        </div>
        {/* 2×2 key metric tiles */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "Revenue",   value: formatMoneyCompact(revenueSelected, currency),     tone: "text-emerald-600", bg: "bg-emerald-500/10" },
            { label: "Completed", value: String(completedSelected.length),                   tone: "text-[var(--ink)]", bg: "bg-sky-500/10" },
            { label: "Total Billed", value: formatMoneyCompact(totalBilledAllChannels, currency), tone: "text-[var(--accent)]", bg: "bg-[var(--accent)]/10" },
            { label: "Expenses",  value: formatMoneyCompact(expensesTotal, currency),        tone: expensesTotal > 0 ? "text-amber-600" : "text-[var(--ink-muted)]", bg: "bg-amber-500/10" },
          ] as { label: string; value: string; tone: string; bg: string }[]).map(({ label, value, tone, bg }) => (
            <div key={label} className={`rounded-2xl border border-[var(--line)] ${bg} px-4 py-3`}>
              <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">{label}</p>
              <p className={`mt-1 text-xl font-black tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        {/* Top device types */}
        {deviceRows.length > 0 && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line)] overflow-hidden">
            <p className="px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">Top device types</p>
            {deviceRows.slice(0, 4).map((d) => (
              <div key={d.device} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-sm font-medium text-[var(--ink)]">{deviceLabel[d.device] ?? d.device}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--ink-muted)]">{d.total} jobs</span>
                  <span className="text-sm font-bold tabular-nums text-[var(--ink)]">{formatMoneyCompact(d.revenue, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/reports?tab=repairs" className="flex items-center justify-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-sm font-medium text-[var(--accent)]">
          Full reports →
        </Link>
      </div>

      {/* ── HEADER (desktop) ─────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Analytics</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Reports</p>
            <p className="text-[13px] text-[var(--ink-muted)]">
              {period === "year" ? `${selectedYear} Annual` : selectedMonthString}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Period toggle */}
            <div className="flex rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-0.5">
              <Link
                href={`/reports?period=month&month=${selectedMonthString}&tab=${tab}`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${period === "month" ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
              >
                Monthly
              </Link>
              <Link
                href={`/reports?period=year&year=${selectedYear}&tab=${tab}`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${period === "year" ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
              >
                Annual
              </Link>
            </div>
            {/* Month / year selector */}
            <MonthSelectForm
              options={selectableMonths}
              name={period === "year" ? "year" : "month"}
              value={period === "year" ? String(selectedYear) : selectedMonthString}
              hiddenFields={{ period, tab }}
            />
            <Link
              href="/jobs"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--ink)]"
            >
              View Jobs
            </Link>
          </div>
        </div>
      </div>
      </div>{/* end hidden lg:block header */}

      {/* ── TAB NAV (desktop only) ──────────────────────────────────────────── */}
      <div className="hidden lg:block">
      <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-[13px] font-semibold transition ${tab === t.key ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      </div>{/* end hidden lg:block tab nav */}

      {/* ── EXECUTIVE SCORECARD ─────────────────────────────────────────────── */}
      <div className="hidden lg:block">
      <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Executive Overview &middot; {period === "year" ? String(selectedYear) : selectedMonthString}
          </p>
          {teamTargetPct !== null && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${teamTargetPct >= 100 ? "bg-emerald-500/15 text-emerald-600" : teamTargetPct >= 80 ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600"}`}>
              {teamTargetPct}% of revenue target
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--line)] lg:grid-cols-6">
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Revenue</p>
            <p className="mt-1 text-xl font-black tabular-nums text-[var(--ink)]">{formatMoneyCompact(revenueSelected, currency)}</p>
            {revenuePrev > 0 ? (
              <p className={`mt-1 text-[12px] font-semibold ${revenueDelta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {revenueDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round((revenueDelta / revenuePrev) * 100))}% vs prior
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">repair collections</p>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Jobs Completed</p>
            <p className="mt-1 text-xl font-black tabular-nums text-[var(--ink)]">{completedSelected.length}</p>
            {completedPrev.length > 0 ? (
              <p className={`mt-1 text-[12px] font-semibold ${completedSelected.length >= completedPrev.length ? "text-emerald-500" : "text-red-500"}`}>
                {completedSelected.length >= completedPrev.length ? "▲" : "▼"} {Math.abs(completedSelected.length - completedPrev.length)} vs prior
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">this period</p>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Net Cash</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${cashNet >= 0 ? "text-[var(--ink)]" : "text-red-500"}`}>{formatMoneyCompact(cashNet, currency)}</p>
            <p className="mt-1 text-[12px] text-[var(--ink-muted)]">in − out − refunds</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Gross Margin</p>
            <p className="mt-1 text-xl font-black tabular-nums text-[var(--ink)]">{revenueSelected > 0 ? `${Math.round((marginSelected / revenueSelected) * 100)}%` : "—"}</p>
            <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{formatMoneyCompact(marginSelected, currency)} on repairs</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Open Pipeline</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${delayedJobs.length > 0 ? "text-amber-500" : "text-[var(--ink)]"}`}>{openJobs.length}</p>
            <p className={`mt-1 text-[12px] font-semibold ${delayedJobs.length > 0 ? "text-red-500" : "text-[var(--ink-muted)]"}`}>
              {delayedJobs.length > 0 ? `${delayedJobs.length} aging 3+ days` : "no aging jobs"}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Lead Conversion</p>
            <p className="mt-1 text-xl font-black tabular-nums text-[var(--ink)]">{totalLeads > 0 ? `${leadConversion}%` : "—"}</p>
            <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{wonLeads} won of {totalLeads}</p>
          </div>
        </div>
        {(delayedJobs.length > 0 || approvalDelays.filter((j) => j.daysPending >= 2).length > 0 || lowStockItems.length > 0) && (
          <div className="border-t border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2">
            <div className="flex flex-wrap gap-4">
              {delayedJobs.length > 0 && (
                <Link href="/reports?tab=repairs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                  {delayedJobs.length} aging job{delayedJobs.length !== 1 ? "s" : ""} need attention
                </Link>
              )}
              {approvalDelays.filter((j) => j.daysPending >= 2).length > 0 && (
                <Link href="/jobs?status=AWAITING_APPROVAL" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:underline">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {approvalDelays.filter((j) => j.daysPending >= 2).length} approval{approvalDelays.filter((j) => j.daysPending >= 2).length !== 1 ? "s" : ""} pending 2+ days
                </Link>
              )}
              {lowStockItems.length > 0 && (
                <Link href="/reports?tab=inventory" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:underline">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {lowStockItems.length} part{lowStockItems.length !== 1 ? "s" : ""} low on stock
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB CONTENT: desktop only (mobile has summary above)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block space-y-4">

      {/* ── TAB: BUSINESS HEALTH
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "business" && (
        <>
          {/* P&L Summary */}
          <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">P&amp;L Summary</p>
                <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Cash-basis profit &amp; loss for {period === "year" ? String(selectedYear) : selectedMonthString}</p>
              </div>
              <Link href="/finance/reports/pl" className="text-xs font-semibold text-[var(--accent)] hover:underline">Full P&amp;L →</Link>
            </div>
            <div className="divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Total Revenue Collected</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Repairs {formatMoneyCompact(repairCollectionsTotal, currency)} · POS {formatMoneyCompact(posSalesTotal, currency)} · Invoices {formatMoneyCompact(invoicesPaidTotal, currency)}
                  </p>
                </div>
                <p className="text-base font-bold text-[var(--ink)]">{formatMoneyCompact(totalAllChannels, currency)}</p>
              </div>
              {cashOutExternal > 0 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-muted)]">Cost of External Repairs</p>
                    <p className="text-xs text-[var(--ink-muted)]">External technician payouts this period</p>
                  </div>
                  <p className="text-base font-semibold text-red-500">− {formatMoneyCompact(cashOutExternal, currency)}</p>
                </div>
              )}
              <div className="flex items-center justify-between bg-[var(--panel-strong)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--ink)]">Gross Profit</p>
                  <p className="text-xs text-[var(--ink-muted)]">{grossMarginPct}% gross margin</p>
                </div>
                <p className={`text-base font-bold ${grossProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatMoneyCompact(grossProfit, currency)}</p>
              </div>
              {expensesTotal > 0 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-muted)]">Operating Expenses</p>
                    <p className="text-xs text-[var(--ink-muted)]">Logged expenses for the period</p>
                  </div>
                  <p className="text-base font-semibold text-red-500">− {formatMoneyCompact(expensesTotal, currency)}</p>
                </div>
              )}
              {cashOutRefunds > 0 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-muted)]">Refunds Issued</p>
                    <p className="text-xs text-[var(--ink-muted)]">Client refunds processed this period</p>
                  </div>
                  <p className="text-base font-semibold text-red-500">− {formatMoneyCompact(cashOutRefunds, currency)}</p>
                </div>
              )}
              <div className="flex items-center justify-between border-t-2 border-[var(--line)] px-4 py-4">
                <div>
                  <p className="text-sm font-bold text-[var(--ink)]">Net Profit</p>
                  <p className="text-xs text-[var(--ink-muted)]">Revenue − costs − expenses − refunds</p>
                </div>
                <p className={`text-xl font-black tabular-nums ${netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatMoneyCompact(netProfit, currency)}</p>
              </div>
            </div>
          </section>

          {/* Cash Flow + Revenue vs Target */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Cash In</p>
              <p className="mt-1 text-lg font-bold text-emerald-500">{formatMoneyCompact(cashIn, currency)}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">payments received</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Cash Out</p>
              <p className="mt-1 text-lg font-bold text-red-500">{formatMoneyCompact(cashOutExternal + cashOutRefunds, currency)}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">payouts + refunds</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Net Cash</p>
              <p className={`mt-1 text-lg font-bold ${cashNet >= 0 ? "text-[var(--ink)]" : "text-red-500"}`}>{formatMoneyCompact(cashNet, currency)}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">in − out</p>
            </div>
          </div>

          {/* Revenue vs Target */}
          {teamTargetRevenue > 0 && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Revenue vs Target</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${teamTargetPct !== null && teamTargetPct >= 100 ? "bg-emerald-500/15 text-emerald-600" : teamTargetPct !== null && teamTargetPct >= 80 ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600"}`}>
                  {teamTargetPct ?? 0}%
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-[var(--ink-muted)]">
                  <span>{formatMoneyCompact(totalAllChannels, currency)} collected</span>
                  <span>Target: {formatMoneyCompact(teamTargetRevenue, currency)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--panel-strong)]">
                  <div
                    className={`h-full rounded-full ${(teamTargetPct ?? 0) >= 100 ? "bg-emerald-500" : (teamTargetPct ?? 0) >= 80 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(teamTargetPct ?? 0, 100)}%` }}
                  />
                </div>
                {(teamTargetPct ?? 0) < 100 && (
                  <p className="text-xs text-[var(--ink-muted)]">
                    {formatMoneyCompact(Math.max(0, teamTargetRevenue - totalAllChannels), currency)} remaining to hit target
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Balance Position: Receivables vs Payables */}
          <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Balance Position</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">What clients owe you vs what you owe suppliers</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[var(--line)]">
              <div className="px-4 py-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-600">Receivables — Owed to You</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-[var(--ink)]">{formatMoneyCompact(receivables.total, currency)}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{receivables.invoiceCount + receivables.saleCount} open invoices &amp; sales</p>
                {receivables.total > 0 && (
                  <Link href="/finance/invoices" className="mt-3 inline-block text-xs font-semibold text-emerald-600 hover:underline">
                    View outstanding invoices →
                  </Link>
                )}
              </div>
              <div className="px-4 py-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-amber-600">Payables — You Owe</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${payablesOutstanding > 0 ? "text-amber-500" : "text-[var(--ink)]"}`}>{formatMoneyCompact(payablesOutstanding, currency)}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">outstanding supplier bills</p>
                {payablesOutstanding > 0 && (
                  <Link href="/inventory/supplier-bills" className="mt-3 inline-block text-xs font-semibold text-amber-600 hover:underline">
                    Review supplier bills →
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* Finance quick links */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/finance/reports/pl" className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 transition hover:bg-[var(--panel-strong)]">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">P&amp;L Report</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Full profit &amp; loss statement</p>
              </div>
              <span className="text-lg text-[var(--ink-muted)]">→</span>
            </Link>
            <Link href="/finance/reports/balance-sheet" className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 transition hover:bg-[var(--panel-strong)]">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Balance Sheet</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Assets, liabilities &amp; equity</p>
              </div>
              <span className="text-lg text-[var(--ink-muted)]">→</span>
            </Link>
            <Link href="/finance/bank" className="panel-shadow flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 transition hover:bg-[var(--panel-strong)]">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Bank Accounts</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">Balances &amp; reconciliation</p>
              </div>
              <span className="text-lg text-[var(--ink-muted)]">→</span>
            </Link>
          </div>

          {businessExports.length > 0 && <ExportGrid items={businessExports} />}
        </>
      )}

      {/* ── TAB: OPERATIONS
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "operations" && (
        <>
          {/* Action Required banner */}
          {(delayedJobs.length > 0 || approvalDelays.filter((j) => j.daysPending >= 2).length > 0) && (
            <section className="overflow-hidden rounded-xl border border-red-200 bg-red-50/60 panel-shadow">
              <div className="border-b border-red-200 px-4 py-2.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-red-700">Action Required</p>
              </div>
              <div className="divide-y divide-red-100">
                {delayedJobs.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-red-700">{delayedJobs.length} job{delayedJobs.length !== 1 ? "s" : ""} aging 3+ days without resolution</p>
                      <p className="text-xs text-red-500">Oldest: {delayedJobs[0].jobNumber} — {delayedJobs[0].ageDays} days open</p>
                    </div>
                    <Link href="/jobs" className="text-xs font-semibold text-red-600 hover:underline">View jobs →</Link>
                  </div>
                )}
                {approvalDelays.filter((j) => j.daysPending >= 2).length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <p className="text-sm font-semibold text-amber-700">
                      {approvalDelays.filter((j) => j.daysPending >= 2).length} client approval{approvalDelays.filter((j) => j.daysPending >= 2).length !== 1 ? "s" : ""} waiting 2+ days — follow up needed
                    </p>
                    <Link href="/jobs?status=AWAITING_APPROVAL" className="text-xs font-semibold text-amber-600 hover:underline">Review →</Link>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Completed</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{completedSelected.length}</p>
              {completedPrev.length > 0 && (
                <p className={`mt-1 text-xs font-semibold ${completedSelected.length >= completedPrev.length ? "text-emerald-500" : "text-red-500"}`}>
                  {completedSelected.length >= completedPrev.length ? "▲" : "▼"} {Math.abs(completedSelected.length - completedPrev.length)} vs prior
                </p>
              )}
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Repair Revenue</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{formatMoneyCompact(revenueSelected, currency)}</p>
              {revenuePrev > 0 && (
                <p className={`mt-1 text-xs font-semibold ${revenueDelta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {revenueDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round((revenueDelta / revenuePrev) * 100))}% vs prior
                </p>
              )}
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Avg Turnaround</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{avgTurnaround > 0 ? turnaroundLabel(avgTurnaround) : "—"}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">all-time avg</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Open Pipeline</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{openJobs.length}</p>
              <p className={`mt-1 text-xs font-semibold ${delayedJobs.length > 0 ? "text-red-500" : "text-[var(--ink-muted)]"}`}>
                {delayedJobs.length > 0 ? `${delayedJobs.length} aging 3+ days` : "no aging jobs"}
              </p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Repair Path</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{externalCount}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">ext &nbsp;·&nbsp; {inHouseCount} in-house</p>
            </div>
          </div>

          {/* Job Pipeline */}
          <section className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Job Pipeline — Current State</p>
            </div>
            <div className="flex overflow-x-auto">
              {statusData.map((s) => (
                <Link key={s.key} href={`/jobs?status=${s.key}`}
                  className="flex min-w-[88px] shrink-0 flex-col items-center border-r border-[var(--line)] px-3 py-3.5 text-center transition hover:bg-[var(--panel-strong)] last:border-r-0">
                  <span className="text-xl font-bold text-[var(--ink)]">{s.value}</span>
                  <span className="mt-1 text-[12px] leading-tight text-[var(--ink-muted)]">{s.name}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Device Breakdown + Fault Keywords */}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Device Breakdown</p>
              {deviceRows.length === 0 ? (
                <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">No jobs in this period</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Device</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Total</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Done</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceRows.map((row) => (
                      <tr key={row.device} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-3 py-2.5 text-sm font-medium text-[var(--ink)]">{row.device}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{row.total}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{row.completed}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink-muted)]">{Math.round(row.completionRate)}%</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{row.revenue > 0 ? formatMoneyCompact(row.revenue, currency) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Common Fault Keywords</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Extracted from all completed diagnosis notes</p>
              {commonFaults.length === 0 ? (
                <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">Not enough data yet</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {commonFaults.map(([word, count]) => (
                    <span key={word} className="inline-flex max-w-full min-w-0 items-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]">
                      <span className="min-w-0 break-all">{word} ({count})</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Aging alerts */}
          {delayedJobs.length > 0 && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Aging Jobs (3+ days open)</p>
                <Link href="/jobs" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">View all</Link>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Job</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {delayedJobs.map((job) => (
                    <tr key={job.jobNumber} className="border-b border-[var(--line)] last:border-b-0">
                      <td className="px-3 py-2.5">
                        <Link href={`/jobs/${job.jobNumber}`} className="text-sm font-medium text-[var(--ink)] hover:underline">{job.jobNumber}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[var(--ink-muted)]">{statusLabel[normalizeJobStatus(job.status as JobStatus)]}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold ${job.ageDays >= 8 ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}>
                          {job.ageDays}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Supply Chain */}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Supply Risk</p>
                  <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                    {lowStockItems.filter((p) => p.qtyOnHand === 0).length} out of stock &middot; {lowStockItems.filter((p) => p.qtyOnHand > 0).length} low
                  </p>
                </div>
                <Link href="/inventory" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">Manage →</Link>
              </div>
              {lowStockItems.length === 0 ? (
                <p className="mt-3 text-center text-xs text-[var(--ink-muted)]">All parts stocked above reorder level</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Part</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">On Hand</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.slice(0, 6).map((part) => (
                      <tr key={part.sku ?? part.name} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-3 py-2.5 text-sm font-medium text-[var(--ink)]">{part.name}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{part.qtyOnHand}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold ${part.qtyOnHand === 0 ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}>
                            {part.qtyOnHand === 0 ? "Out of stock" : "Low"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Stock &amp; Payables</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--ink-muted)]">Stock Value (tracked parts)</p>
                  <p className="text-sm font-bold text-[var(--ink)]">{formatMoneyCompact(totalStockValue, currency)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--ink-muted)]">Outstanding Supplier Bills</p>
                  <p className={`text-sm font-bold ${payablesOutstanding > 0 ? "text-amber-500" : "text-[var(--ink)]"}`}>{formatMoneyCompact(payablesOutstanding, currency)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--ink-muted)]">Parts at or Below Reorder</p>
                  <p className={`text-sm font-bold ${lowStockItems.length > 0 ? "text-red-500" : "text-emerald-500"}`}>{lowStockItems.length} of {lowStockParts.length}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <Link href="/stock/purchase-orders" className="text-xs font-semibold text-[var(--accent)] hover:underline">Purchase orders →</Link>
                <span className="text-xs text-[var(--ink-muted)]">·</span>
                <Link href="/inventory/supplier-bills" className="text-xs font-semibold text-[var(--accent)] hover:underline">Supplier bills →</Link>
              </div>
            </div>
          </div>

          {operationsExports.length > 0 && <ExportGrid items={operationsExports} />}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: COMMERCIAL
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "commercial" && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">POS Revenue</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{formatMoneyCompact(posSalesTotal, currency)}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{salesByPeriod.length} sales this period</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Lead Conversion</p>
              <p className={`mt-1 text-lg font-bold ${leadConversion >= 50 ? "text-emerald-500" : leadConversion >= 25 ? "text-amber-500" : "text-[var(--ink)]"}`}>{totalLeads > 0 ? `${leadConversion}%` : "—"}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{wonLeads} won of {totalLeads} leads</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">New Clients</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{newClientsCount}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">joined this period</p>
            </div>
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Quotes Approved</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{quotationsApproved}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{quotationTotal > 0 ? `${quotationConversionPct}% conversion rate` : "no quotes this period"}</p>
            </div>
          </div>

          {/* Lead funnel */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Lead Funnel</p>
                <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">All-time leads by stage</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[var(--ink-muted)]">Conversion rate</p>
                <p className={`text-lg font-black ${leadConversion >= 50 ? "text-emerald-600" : leadConversion >= 25 ? "text-amber-500" : "text-red-500"}`}>{totalLeads > 0 ? `${leadConversion}%` : "—"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-center">
                <p className="text-xl font-bold text-[var(--ink)]">{totalLeads}</p>
                <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Total</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-center">
                <p className="text-xl font-bold text-emerald-500">{wonLeads}</p>
                <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Won</p>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-center">
                <p className="text-xl font-bold text-red-500">{leadCountMap.get("LOST") ?? 0}</p>
                <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Lost</p>
              </div>
            </div>
            {totalLeads > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)]">
                <div className="flex overflow-x-auto">
                  {(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const).map((key) => {
                    const labels: Record<string, string> = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL: "Proposal", WON: "Won", LOST: "Lost" };
                    const count = leadCountMap.get(key) ?? 0;
                    return (
                      <Link key={key} href={`/sales/leads?status=${key}`}
                        className="flex min-w-[88px] shrink-0 flex-col items-center border-r border-[var(--line)] px-3 py-3.5 text-center transition hover:bg-[var(--panel-strong)] last:border-r-0">
                        <span className="text-xl font-bold text-[var(--ink)]">{count}</span>
                        <span className="mt-1 text-[12px] leading-tight text-[var(--ink-muted)]">{labels[key]}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">No leads recorded yet</p>
            )}
          </section>

          {/* Quotation pipeline */}
          {quotationTotal > 0 && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Quotation Pipeline</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-center">
                  <p className="text-xl font-bold text-[var(--ink)]">{quotationsSent}</p>
                  <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Sent</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-emerald-600">{quotationsApproved}</p>
                  <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-emerald-700">Approved</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-500/10 p-3 text-center">
                  <p className="text-xl font-bold text-red-500">{quotationsExpired}</p>
                  <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-red-600">Expired</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-center">
                  <p className={`text-xl font-bold ${quotationConversionPct >= 60 ? "text-emerald-600" : quotationConversionPct >= 40 ? "text-amber-500" : "text-red-500"}`}>{quotationConversionPct}%</p>
                  <p className="mt-0.5 text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Conversion</p>
                </div>
              </div>
            </section>
          )}

          {/* Staff Revenue vs Target */}
          {staffRevRows.length > 0 && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Staff Revenue vs Target</p>
                {teamTargetRevenue > 0 && (
                  <span className="text-xs text-[var(--ink-muted)]">Team target: {formatMoneyCompact(teamTargetRevenue, currency)}</span>
                )}
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Name</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Repairs</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">POS</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Target</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRevRows.map((row) => {
                    const pct = row.target > 0 ? Math.round((row.total / row.target) * 100) : null;
                    return (
                      <tr key={row.name} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-3 py-2.5 text-sm font-medium text-[var(--ink)]">{row.name}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink-muted)]">{formatMoneyCompact(row.repairRev, currency)}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink-muted)]">{formatMoneyCompact(row.posRev, currency)}</td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-[var(--ink)]">{formatMoneyCompact(row.total, currency)}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink-muted)]">{row.target > 0 ? formatMoneyCompact(row.target, currency) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          {pct !== null ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold ${pct >= 100 ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>{pct}%</span>
                          ) : <span className="text-xs text-[var(--ink-muted)]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {commercialExports.length > 0 && <ExportGrid items={commercialExports} />}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: TEAM
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "team" && (
        <>
          {/* Technician Performance */}
          <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Technician Performance</p>
                <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Jobs assigned in selected period</p>
              </div>
              {techPerf.length > 0 && (
                <div className="text-right">
                  <p className="text-[11px] text-[var(--ink-muted)]">Top: <span className="font-semibold text-[var(--ink)]">{techPerf[0].name}</span></p>
                  <p className="text-[11px] text-[var(--ink-muted)]">{techPerf.filter((t) => t.completionRate >= 80).length} of {techPerf.length} at 80%+ completion</p>
                </div>
              )}
            </div>
            {techPerf.length === 0 ? (
              <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">No assigned jobs in this period</p>
            ) : (
              <>
                <div className="mt-4 h-40">
                  <TechnicianBarChart data={techPerf.map((t) => ({ name: t.name, completed: t.completed, total: t.total }))} />
                </div>
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Role</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Total</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Done</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Avg Time</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techPerf.map((t) => (
                      <tr key={t.name} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-3 py-2.5 text-sm font-medium text-[var(--ink)]">{t.name}</td>
                        <td className="px-3 py-2.5 text-xs text-[var(--ink-muted)]">{t.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{t.total}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{t.completed}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold ${t.completionRate >= 80 ? "bg-emerald-500/15 text-emerald-600" : t.completionRate >= 50 ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600"}`}>
                            {Math.round(t.completionRate)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink-muted)]">{t.avgTurnaround > 0 ? turnaroundLabel(t.avgTurnaround) : "—"}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-[var(--ink)]">{t.revenue > 0 ? formatMoneyCompact(t.revenue, currency) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          {/* Approval Queue */}
          {approvalDelays.length > 0 && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Awaiting Client Approval</p>
                <Link href="/jobs?status=AWAITING_APPROVAL" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]">View all</Link>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Job</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--ink-muted)]">Device</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--ink-muted)]">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalDelays.map((job) => (
                    <tr key={job.id} className="border-b border-[var(--line)] last:border-b-0">
                      <td className="px-3 py-2.5">
                        <Link href={`/jobs/${job.jobNumber}`} className="text-sm font-medium text-[var(--ink)] hover:underline">{job.jobNumber}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[var(--ink-muted)]">{deviceLabel[job.deviceType] ?? job.deviceType} · {job.brand} {job.model}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold ${job.daysPending >= 3 ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}>
                          {job.daysPending}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {teamExports.length > 0 && <ExportGrid items={teamExports} />}
        </>
      )}

      </div>{/* end hidden lg:block tab content */}
    </div>
  );
}
