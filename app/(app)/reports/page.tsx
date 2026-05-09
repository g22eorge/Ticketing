import Link from "next/link";
import { redirect } from "next/navigation";

import { PersistedDisclosure } from "@/components/mobile/PersistedDisclosure";
import { TechnicianBarChart } from "@/components/reports/ReportsCharts";
import { MonthSelectForm } from "@/components/shared/MonthSelectForm";
import { getClientBill, getExternalTechBill, resolveTechCost } from "@/lib/billing";
import { formatMoney, formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { formatEATMonthLabel } from "@/lib/date-eat";
import { UI_JOB_STATUSES, JobStatus, normalizeJobStatus } from "@/lib/job-status";
import { filterSupportedJobStatuses } from "@/lib/job-status-server";
import { can } from "@/lib/permissions";
import { getJobPayoutsByIds } from "@/lib/payouts";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

type SearchParams = {
  month?: string;
  year?: string;
  period?: string;
};

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
  const out = [] as Array<{ value: string; label: string }>;
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
  const filters = await searchParams;
  const { user, orgId } = await requireOrgSession();
  const period: "month" | "year" = filters.period === "year" ? "year" : "month";
  if (!can.viewAccountsSummary(user)) {
    redirect("/dashboard");
  }

  const selectedMonth = parseMonth(filters.month);
  const selectedYear = Number(filters.year) || new Date().getFullYear();
  const selectedRange = period === "year" ? yearRange(selectedYear) : monthRange(selectedMonth.year, selectedMonth.month);
  const prevRange =
    period === "year"
      ? yearRange(selectedYear - 1)
      : monthRange(new Date(selectedMonth.year, selectedMonth.month - 2, 1).getFullYear(), new Date(selectedMonth.year, selectedMonth.month - 2, 1).getMonth() + 1);

  const [
    statusGroup,
    completedAll,
    completedSelected,
    completedPrev,
    openJobs,
    externalCount,
    inHouseCount,
    externalPayoutOutstandingJobs,
    paymentsAgg,
    invoicesAgg,
    paidExternalJobs,
    earliestJob,
    latestJob,
  ] = await Promise.all([
    prisma.job.groupBy({ by: ["status"], where: { orgId }, _count: { status: true } }),
    // Bug fix #2: narrow select to only fields we actually use
    prisma.job.findMany({
      where: { orgId, status: "COMPLETED" },
      select: { completedAt: true, receivedAt: true, diagnosisNotes: true, externalDiagnosis: true },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        status: "COMPLETED",
        completedAt: { gte: selectedRange.start, lte: selectedRange.end },
      },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        status: "COMPLETED",
        completedAt: { gte: prevRange.start, lte: prevRange.end },
      },
    }),
    prisma.job.findMany({
      where: {
        orgId,
        status: {
          in: filterSupportedJobStatuses([
            "RECEIVED",
            "DIAGNOSING",
            "REFERRED",
            // Legacy external workflow states
            "IN_EXTERNAL_REPAIR",
            "WAITING_FOR_PARTS",
            "RETURNED_FROM_EXTERNAL",
            "AWAITING_APPROVAL",
            "IN_REPAIR",
            "READY_FOR_PICKUP",
          ]) as JobStatus[],
        },
      },
      select: { jobNumber: true, status: true, receivedAt: true, updatedAt: true },
    }),
    prisma.job.count({ where: { orgId, repairPath: "EXTERNAL", status: "COMPLETED", completedAt: { gte: selectedRange.start, lte: selectedRange.end } } }),
    prisma.job.count({ where: { orgId, repairPath: "IN_HOUSE", status: "COMPLETED", completedAt: { gte: selectedRange.start, lte: selectedRange.end } } }),
    // Bug fix #1: remove assignedTo filter, add READY_FOR_PICKUP and DELIVERED statuses
    prisma.job.findMany({
      where: {
        orgId,
        repairPath: "EXTERNAL",
        status: { in: ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] as JobStatus[] },
      },
      select: { id: true, externalTechBill: true },
    }),
    prisma.payment.aggregate({
      where: { orgId, receivedAt: { gte: selectedRange.start, lte: selectedRange.end } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { orgId, issuedAt: { gte: selectedRange.start, lte: selectedRange.end } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.job.findMany({
      where: { orgId, externalPaid: true, externalPaidAt: { gte: selectedRange.start, lte: selectedRange.end } },
      select: { externalTechFee: true, externalTechBill: true },
    }),
    prisma.job.findFirst({ where: { orgId }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
    prisma.job.findFirst({ where: { orgId }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
  ]);

  const currentYear = new Date().getFullYear();
  const minYear = earliestJob?.receivedAt?.getFullYear() ?? currentYear;
  const maxYear = Math.max(currentYear, latestJob?.receivedAt?.getFullYear() ?? currentYear);

  const externalPayoutMap = await getJobPayoutsByIds(externalPayoutOutstandingJobs.map((job) => job.id));
  const unpaidPayouts = externalPayoutOutstandingJobs
    .filter((job) => !externalPayoutMap.get(job.id)?.externalPaid)
    .map((job) => ({
      amount: resolveTechCost(externalPayoutMap.get(job.id)?.externalTechFee, job.externalTechBill),
    }));

  const externalPayoutOutstandingTotal = unpaidPayouts.reduce((sum, payout) => sum + payout.amount, 0);

  const statusCount = new Map(statusGroup.map((s) => [normalizeJobStatus(s.status as JobStatus), s._count.status]));
  const statusData = UI_JOB_STATUSES.map((status) => ({
    key: status,
    name: statusLabel[status],
    value: statusCount.get(status) ?? 0,
  }));

  const pricedSubset = <T extends typeof completedSelected[number]>(jobs: T[]) =>
    jobs.filter((job) => getClientBill(job) !== null);

  const revenueFor = (jobs: typeof completedSelected) =>
    pricedSubset(jobs).reduce((sum, job) => sum + (getClientBill(job) ?? 0), 0);
  const revenueSelected = revenueFor(completedSelected);
  const revenuePrev = revenueFor(completedPrev);
  const revenueDelta = revenueSelected - revenuePrev;
  const marginSelected = pricedSubset(completedSelected).reduce(
    (sum, job) => sum + ((getClientBill(job) ?? 0) - (getExternalTechBill(job) ?? 0)),
    0,
  );

  // Cashflow (payments + external payouts).
  const cashIn = paymentsAgg._sum.amount ?? 0;
  const cashOutExternal = paidExternalJobs.reduce(
    (sum, job) => sum + resolveTechCost(job.externalTechFee, job.externalTechBill),
    0,
  );
  const cashNet = cashIn - cashOutExternal;
  const issuedTotal = invoicesAgg._sum.totalAmount ?? 0;
  const issuedPaid = invoicesAgg._sum.paidAmount ?? 0;
  const issuedBalance = Math.max(0, issuedTotal - issuedPaid);
  const averageRepairTimeHours = (() => {
    const values = completedAll
      .filter((job) => job.completedAt)
      .map((job) => (job.completedAt!.getTime() - job.receivedAt.getTime()) / 36e5);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  })();

  const commonFaults = (() => {
    // Generic repair-shop words that are not fault keywords
    const STOP_WORDS = new Set([
      // Articles / pronouns / conjunctions / connectives
      "about", "above", "after", "again", "also", "although", "always", "another",
      "because", "before", "being", "below", "between", "both", "could", "during",
      "either", "every", "found", "given", "having", "hence", "itself", "large",
      "later", "least", "might", "needs", "never", "often", "other", "otherwise",
      "place", "please", "quite", "rather", "since", "small", "still", "their",
      "there", "therefore", "these", "thing", "think", "those", "three", "through",
      "under", "until", "using", "very", "which", "while", "whose", "will",
      "within", "without", "would", "where", "when", "then", "them", "than",
      "should", "shall", "however", "despite", "though", "whereas", "whereby",
      // Generic repair nouns
      "machine", "device", "phone", "client", "customer", "repair", "technician",
      "laptop", "computer", "tablet", "unit", "issue", "problem", "complaint",
      "service", "parts", "spare", "component", "item", "order", "ticket",
      "check", "checked", "checking", "tested", "testing", "working", "noted",
      "replace", "replaced", "repaired", "repairing", "found", "fixing", "fixed",
      "update", "updated", "reset", "setup", "install", "installed",
      "confirmed", "reported", "returned", "advised", "informed", "seems",
      "appears", "recommend", "recommended", "suggested", "completed", "received",
      "failed", "failure", "faulty", "damaged", "broken", "affecting", "caused",
      "causing", "result", "resulting", "unable", "cannot", "could", "found",
      // Informal / misspelling variants common in technician notes
      "bicoz", "becoz", "becos", "becaus",
      // Generic action verbs
      "enters", "enter", "doing", "makes", "takes", "turns", "comes", "goes",
      "gives", "shows", "brings", "needs", "wants", "tries", "tried", "start",
      "starts", "stops", "works", "works", "opens", "close", "closes", "power",
      "powers", "press", "click", "touch", "swipe", "boots", "boots",
    ]);
    const source = completedAll
      .map((job) => `${job.diagnosisNotes ?? ""} ${job.externalDiagnosis ?? ""}`.toLowerCase())
      .join(" ");
    const tokens = source
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 5 && !STOP_WORDS.has(word));
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  const totalPath = inHouseCount + externalCount;
  const externalRatio = totalPath > 0 ? (externalCount / totalPath) * 100 : 0;

  const now =
    openJobs.length > 0
      ? Math.max(...openJobs.map((job) => job.updatedAt.getTime()))
      : selectedRange.end.getTime();
  const agingByStatus = new Map<string, { threeToSeven: number; eightPlus: number }>();
  const delayedJobs = openJobs
    .map((job) => {
      const ageDays = Math.floor((now - job.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
      return { ...job, ageDays };
    })
    .filter((job) => job.ageDays >= 3)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 6);

  for (const job of openJobs) {
    const ageDays = Math.floor((now - job.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
    const current = agingByStatus.get(job.status) ?? { threeToSeven: 0, eightPlus: 0 };
    if (ageDays >= 3 && ageDays <= 7) current.threeToSeven += 1;
    if (ageDays >= 8) current.eightPlus += 1;
    agingByStatus.set(job.status, current);
  }

  const agingRows = [...agingByStatus.entries()]
    .map(([status, buckets]) => ({ status, ...buckets }))
    .filter((row) => row.threeToSeven > 0 || row.eightPlus > 0)
    .sort((a, b) => b.eightPlus - a.eightPlus || b.threeToSeven - a.threeToSeven);

  const funnel = {
    diagnosing: statusData.find((s) => s.key === "DIAGNOSING")?.value ?? 0,
    awaitingApproval: statusData.find((s) => s.key === "AWAITING_APPROVAL")?.value ?? 0,
    inRepair: statusData.find((s) => s.key === "IN_REPAIR")?.value ?? 0,
    readyForPickup: statusData.find((s) => s.key === "READY_FOR_PICKUP")?.value ?? 0,
    completed: statusData.find((s) => s.key === "COMPLETED")?.value ?? 0,
  };

  const selectedMonthString = period === "year" ? String(selectedYear) : monthLabel(selectedMonth.year, selectedMonth.month);
  const prevMonthString =
    period === "year"
      ? String(selectedYear - 1)
      : monthLabel(new Date(selectedMonth.year, selectedMonth.month - 2, 1).getFullYear(), new Date(selectedMonth.year, selectedMonth.month - 2, 1).getMonth() + 1);
  const currency = getAppCurrency();
  const selectableMonths = period === "year" ? yearOptions(minYear, maxYear) : monthOptions(18);
  const monthlyExportMonth = monthLabel(selectedMonth.year, selectedMonth.month);
  const trendNow = new Date();
  const yearToDateMonthCount = trendNow.getMonth() + 1;
  const trendMonths = monthSequence(trendNow.getFullYear(), trendNow.getMonth() + 1, yearToDateMonthCount);

  const trendJobs = await prisma.job.findMany({
    where: {
      receivedAt: {
        gte: trendMonths[0].start,
        lte: trendMonths[trendMonths.length - 1].end,
      },
    },
    select: {
      deviceType: true,
      receivedAt: true,
    },
  });

  const [techPerfJobsRaw, approvalDelayJobs] = await Promise.all([
    prisma.job.findMany({
      where: {
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
      where: { status: "AWAITING_APPROVAL" },
      select: { id: true, jobNumber: true, receivedAt: true, updatedAt: true, brand: true, model: true, deviceType: true },
      orderBy: { updatedAt: "asc" },
      take: 12,
    }),
  ]);

  const nowTs = new Date();

  const techPerfMap = new Map<
    string,
    { name: string; role: string; total: number; completed: number; open: number; turnaroundSum: number; turnaroundCount: number; revenue: number }
  >();
  for (const job of techPerfJobsRaw) {
    if (!job.assignedTo) continue;
    const existing = techPerfMap.get(job.assignedTo.id) ?? {
      name: job.assignedTo.name,
      role: job.assignedTo.role,
      total: 0,
      completed: 0,
      open: 0,
      turnaroundSum: 0,
      turnaroundCount: 0,
      revenue: 0,
    };
    existing.total += 1;
    if (
      ["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)
    ) {
      existing.open += 1;
    }
    if (job.status === "COMPLETED") {
      existing.completed += 1;
      if (job.completedAt) {
        existing.turnaroundSum += (job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5;
        existing.turnaroundCount += 1;
      }
      const bill = getClientBill(job);
      if (typeof bill === "number") existing.revenue += bill;
    }
    techPerfMap.set(job.assignedTo.id, existing);
  }
  const techPerf = [...techPerfMap.values()]
    .map((t) => ({
      ...t,
      completionRate: t.total > 0 ? (t.completed / t.total) * 100 : 0,
      avgTurnaround: t.turnaroundCount > 0 ? t.turnaroundSum / t.turnaroundCount : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const approvalDelays = approvalDelayJobs.map((job) => ({
    ...job,
    daysPending: Math.floor((nowTs.getTime() - job.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  const trendByDevice = new Map<string, Map<string, number>>();
  for (const job of trendJobs) {
    const device = deviceLabel[job.deviceType] ?? job.deviceType;
    const key = monthLabel(job.receivedAt.getFullYear(), job.receivedAt.getMonth() + 1);
    const monthMap = trendByDevice.get(device) ?? new Map<string, number>();
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    trendByDevice.set(device, monthMap);
  }

  const jobsInSelectedMonth = await prisma.job.findMany({
    where: {
      receivedAt: { gte: selectedRange.start, lte: selectedRange.end },
    },
    select: {
      deviceType: true,
      status: true,
      receivedAt: true,
      completedAt: true,
      repairPath: true,
      assignedTo: { select: { name: true } },
      externalTechBill: true,
      clientBill: true,
    },
  });

  const deviceInsights = (() => {
    const map = new Map<
      string,
      {
        total: number;
        open: number;
        completed: number;
        cancelledOrClosed: number;
        ext: number;
        inHouse: number;
        turnaroundHoursSum: number;
        turnaroundCount: number;
        revenue: number;
        margin: number;
        techFreq: Map<string, number>;
      }
    >();

    const ensure = (device: string) => {
      const existing = map.get(device);
      if (existing) return existing;
      const created = {
        total: 0,
        open: 0,
        completed: 0,
        cancelledOrClosed: 0,
        ext: 0,
        inHouse: 0,
        turnaroundHoursSum: 0,
        turnaroundCount: 0,
        revenue: 0,
        margin: 0,
        techFreq: new Map<string, number>(),
      };
      map.set(device, created);
      return created;
    };

    for (const job of jobsInSelectedMonth) {
      const bucket = ensure(deviceLabel[job.deviceType] ?? job.deviceType);
      bucket.total += 1;
      if (["RECEIVED", "DIAGNOSING", "REFERRED", "IN_EXTERNAL_REPAIR", "AWAITING_APPROVAL", "IN_REPAIR", "READY_FOR_PICKUP"].includes(job.status)) {
        bucket.open += 1;
      }
      if (job.status === "COMPLETED") {
        bucket.completed += 1;
        if (job.completedAt) {
          bucket.turnaroundHoursSum += (job.completedAt.getTime() - job.receivedAt.getTime()) / 36e5;
          bucket.turnaroundCount += 1;
        }
        const clientBill = getClientBill(job);
        if (typeof clientBill === "number") {
          const extBill = getExternalTechBill(job) ?? 0;
          bucket.revenue += clientBill;
          bucket.margin += clientBill - extBill;
        }
      }
      if (job.status === "CLOSED") {
        bucket.cancelledOrClosed += 1;
      }
      if (job.repairPath === "EXTERNAL") bucket.ext += 1;
      if (job.repairPath === "IN_HOUSE") bucket.inHouse += 1;
      if (job.assignedTo?.name) {
        bucket.techFreq.set(job.assignedTo.name, (bucket.techFreq.get(job.assignedTo.name) ?? 0) + 1);
      }
    }

    return [...map.entries()]
      .map(([device, value]) => ({
        device,
        total: value.total,
        completed: value.completed,
        open: value.open,
        cancelledOrClosed: value.cancelledOrClosed,
        completionRate: value.total > 0 ? (value.completed / value.total) * 100 : 0,
        avgTurnaroundHours: value.turnaroundCount > 0 ? value.turnaroundHoursSum / value.turnaroundCount : 0,
        revenue: value.revenue,
        margin: value.margin,
        avgMarginPerCompleted: value.completed > 0 ? value.margin / value.completed : 0,
        ext: value.ext,
        inHouse: value.inHouse,
        topTech: [...value.techFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-",
        trend: trendMonths.map((m) => trendByDevice.get(device)?.get(m.key) ?? 0),
      }))
      .sort((a, b) => b.total - a.total);
  })();

  const topDevices = deviceInsights.slice(0, 5).map((item) => ({ name: item.device, value: item.total }));
  const queuePressure = funnel.diagnosing + funnel.awaitingApproval + funnel.inRepair;
  const completionMomentum = completedSelected.length - completedPrev.length;

  const exportItems = [
    {
      title: "Pipeline Aging",
      caption: "Queue delay risk by status bands",
      href: "/api/reports/export?type=pipeline-aging",
    },
    ...(user.role === "ADMIN"
      ? [
          {
            title: "Repair Margin",
            caption: "Job-level client bill vs technician cost",
            href: `/api/reports/export?type=revenue-variance&month=${monthlyExportMonth}`,
          },
        ]
      : []),
    {
      title: "Technician Performance",
      caption: "Throughput and completion mix per technician",
      href: "/api/reports/export?type=technician-performance",
    },
    ...(user.role === "ADMIN"
      ? [
          {
            title: "External Payouts",
            caption: "Outstanding and paid external technician fees",
            href: "/api/reports/export?type=external-payouts",
          },
        ]
      : []),
    {
      title: "Device Performance",
      caption: "Device type completion, margin, and trend",
      href: `/api/reports/export?type=device-performance&month=${monthlyExportMonth}`,
    },
  ];

  const annualExportPackages = [
    {
      title: `${selectedYear} Annual Finance Package`,
      caption: "Revenue variance, external payouts, and pipeline aging",
      href: `/reports?period=year&year=${selectedYear}`,
    },
    {
      title: `${selectedYear - 1} Annual Finance Package`,
      caption: "Previous year comparison pack",
      href: `/reports?period=year&year=${selectedYear - 1}`,
    },
  ];

  const financeBrief = period === "year"
    ? `Annual financial package for ${selectedYear}. Review full-year revenue, margin, external payouts, and pipeline aging. Switch to Monthly for period-by-period detail.`
    : `Monthly financial snapshot for ${formatEATMonthLabel(parseMonth(filters.month).year, parseMonth(filters.month).month)}. Track revenue, margin, completed jobs, and outstanding external payouts. Export reports using the Export Centre below.`;

  return (
    <div className="space-y-5">

      {/* 1. COMMAND HEADER */}
      <section className="panel-shadow flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4">
        <div className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent)]/20" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-base font-bold text-[var(--ink)]">Financial Reports</p>
          <p className="text-[11px] text-[var(--ink-muted)]">{financeBrief.split(".")[0]}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period toggle */}
          <div className="flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] p-1">
            <Link
              href={`/reports?period=month&month=${monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}`}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                period === "month"
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Monthly
            </Link>
            <Link
              href={`/reports?period=year&year=${new Date().getFullYear()}`}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                period === "year"
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Annual
            </Link>
          </div>
          <MonthSelectForm
            name={period === "year" ? "year" : "month"}
            value={selectedMonthString}
            options={selectableMonths}
            hiddenFields={{ period }}
            className="flex items-center"
            selectClassName="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]/50"
          />
          <Link
            href="/jobs"
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            View Jobs →
          </Link>
        </div>
      </section>

      {/* 2. FINANCIAL COMMAND CENTER — 4 premium KPI tiles (clickable) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/documents/invoices"
          className="panel-shadow relative overflow-hidden rounded-xl border border-emerald-200/60 bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-emerald-400/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/30 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Cash In</p>
            <p className="mt-1.5 text-2xl font-bold text-emerald-700">{formatMoneyCompact(cashIn, currency)}</p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">payments received</p>
          </div>
        </Link>

        <Link
          href="/payout-followups"
          className="panel-shadow relative overflow-hidden rounded-xl border border-amber-200/60 bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-amber-400/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/30 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Cash Out</p>
            <p className="mt-1.5 text-2xl font-bold text-amber-700">{formatMoneyCompact(cashOutExternal, currency)}</p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">external payouts</p>
          </div>
        </Link>

        <div className={`panel-shadow relative overflow-hidden rounded-xl border bg-[var(--panel)] p-4 ${cashNet >= 0 ? "border-blue-200/60" : "border-red-200/60"}`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${cashNet >= 0 ? "from-blue-50/30" : "from-red-50/30"} to-transparent`} />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Net</p>
            <p className={`mt-1.5 text-2xl font-bold ${cashNet >= 0 ? "text-blue-700" : "text-red-600"}`}>
              {formatMoneyCompact(cashNet, currency)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">cash in minus out</p>
          </div>
        </div>

        <Link
          href="/documents/invoices"
          className="panel-shadow relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-[var(--accent)]/40"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Balance</p>
            <p className="mt-1.5 text-2xl font-bold text-[var(--ink)]">{formatMoneyCompact(issuedBalance, currency)}</p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">issued minus paid</p>
          </div>
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Revenue */}
        <Link
          href={`/jobs?status=COMPLETED&dateField=completedAt&from=${selectedRange.start.toISOString().slice(0,10)}&to=${selectedRange.end.toISOString().slice(0,10)}`}
          className="panel-shadow relative overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-[var(--accent)]/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/5 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Revenue</p>
            <p className="mt-1.5 text-2xl font-bold text-[var(--ink)]">{formatMoneyCompact(revenueSelected, currency)}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${revenueDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {revenueDelta >= 0 ? "+" : ""}{formatMoneyCompact(Math.abs(revenueDelta), currency)}
              </span>
              <span className="text-[10px] text-[var(--ink-muted)]">vs {prevMonthString}</span>
            </div>
          </div>
        </Link>

        {/* Margin */}
        <Link
          href={`/api/reports/export?type=revenue-variance&month=${monthlyExportMonth}`}
          className={`panel-shadow relative overflow-hidden rounded-xl border bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] ${marginSelected >= 0 ? "border-emerald-200/60 hover:border-emerald-400/60" : "border-red-200/60 hover:border-red-400/60"}`}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${marginSelected >= 0 ? "from-emerald-50/40" : "from-red-50/40"} to-transparent`} />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Margin</p>
            <p className={`mt-1.5 text-2xl font-bold ${marginSelected >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {formatMoneyCompact(marginSelected, currency)}
            </p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">
              {completedSelected.length > 0
                ? `${formatMoneyCompact(marginSelected / completedSelected.length, currency)} avg / job`
                : "No completed jobs"}
            </p>
          </div>
        </Link>

        {/* Completed */}
        <Link
          href={`/jobs?status=COMPLETED&dateField=completedAt&from=${selectedRange.start.toISOString().slice(0,10)}&to=${selectedRange.end.toISOString().slice(0,10)}`}
          className="panel-shadow relative overflow-hidden rounded-xl border border-blue-200/60 bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-blue-400/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Completed</p>
            <p className="mt-1.5 text-2xl font-bold text-[var(--ink)]">{completedSelected.length}</p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">
              {completionMomentum >= 0 ? "+" : ""}{completionMomentum} vs {prevMonthString}
            </p>
          </div>
        </Link>

        {/* Payouts Due */}
        <Link
          href="/payout-followups"
          className="panel-shadow relative overflow-hidden rounded-xl border border-amber-200/60 bg-[var(--panel)] p-4 transition hover:-translate-y-[2px] hover:border-amber-400/60"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/30 to-transparent" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Payouts Due</p>
            <p className="mt-1.5 text-2xl font-bold text-amber-700">{formatMoneyCompact(externalPayoutOutstandingTotal, currency)}</p>
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">
              {unpaidPayouts.length} unpaid external {unpaidPayouts.length === 1 ? "job" : "jobs"}
            </p>
          </div>
        </Link>
      </section>

      {/* 3. OPERATIONS INTELLIGENCE STRIP */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Operations Intelligence — {selectedMonthString}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Link href={`/jobs?status=COMPLETED&dateField=completedAt&from=${selectedRange.start.toISOString().slice(0,10)}&to=${selectedRange.end.toISOString().slice(0,10)}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Revenue Δ</p>
            <p className={`mt-0.5 text-sm font-bold ${revenueDelta >= 0 ? "text-[var(--accent)]" : "text-red-500"}`}>
              {revenueDelta >= 0 ? "+" : ""}{formatMoneyCompact(Math.abs(revenueDelta), currency)}
            </p>
            <p className="text-[9px] text-[var(--ink-muted)]">vs {prevMonthString}</p>
          </Link>
          <Link href="/jobs?status=COMPLETED" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Avg Repair Time</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--ink)]">{averageRepairTimeHours.toFixed(1)}h</p>
            <p className="text-[9px] text-[var(--ink-muted)]">all completed</p>
          </Link>
          <Link href="/jobs?repairPath=EXTERNAL&status=COMPLETED" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">External Ratio</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--ink)]">{externalRatio.toFixed(0)}%</p>
            <p className="text-[9px] text-[var(--ink-muted)]">{externalCount} ext / {inHouseCount} in-house</p>
          </Link>
          <Link href={`/jobs?status=COMPLETED&dateField=completedAt&from=${selectedRange.start.toISOString().slice(0,10)}&to=${selectedRange.end.toISOString().slice(0,10)}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Momentum</p>
            <p className={`mt-0.5 text-sm font-bold ${completionMomentum >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {completionMomentum >= 0 ? "+" : ""}{completionMomentum}
            </p>
            <p className="text-[9px] text-[var(--ink-muted)]">completed vs prev period</p>
          </Link>
          <Link href="/jobs?status=DIAGNOSING,AWAITING_APPROVAL,IN_REPAIR" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Queue Pressure</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--accent)]">{queuePressure}</p>
            <p className="text-[9px] text-[var(--ink-muted)]">diagn + approval + repair</p>
          </Link>
          <Link href="/jobs?status=DIAGNOSING,REFERRED,AWAITING_APPROVAL,IN_REPAIR" className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 transition hover:border-[var(--accent)]/40">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">Aging Risk</p>
            <p className={`mt-0.5 text-sm font-bold ${delayedJobs.length > 3 ? "text-amber-600" : delayedJobs.length > 0 ? "text-[var(--ink)]" : "text-emerald-600"}`}>
              {delayedJobs.length}
            </p>
            <p className="text-[9px] text-[var(--ink-muted)]">open jobs &gt;3 days</p>
          </Link>
        </div>
      </section>

      {/* 4. TECHNICIAN PERFORMANCE */}
      {techPerf.length > 0 ? (
        <>
          {/* Mobile */}
          <PersistedDisclosure
            title="Technician Performance"
            storageKey="reports.techPerf"
            groupName="reports-mobile-sections"
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
          >
            <div className="space-y-2">
              {techPerf.map((tech) => (
                <div key={tech.name} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{tech.name}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">{tech.role === "TECHNICIAN_EXTERNAL" ? "External" : "Internal"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tech.role === "TECHNICIAN_EXTERNAL" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
                      {tech.completionRate.toFixed(0)}% done
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[var(--ink-muted)]">Assigned</p><p className="font-semibold">{tech.total}</p></div>
                    <div><p className="text-[var(--ink-muted)]">Completed</p><p className="font-semibold text-[var(--accent)]">{tech.completed}</p></div>
                    <div><p className="text-[var(--ink-muted)]">Avg Time</p><p className="font-semibold">{tech.avgTurnaround.toFixed(0)}h</p></div>
                  </div>
                </div>
              ))}
            </div>
          </PersistedDisclosure>

          {/* Desktop */}
          <div className="panel-shadow hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 lg:block">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Technician Performance</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{selectedMonthString} — Throughput, Completion &amp; Revenue</p>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <TechnicianBarChart
                data={techPerf.map((t) => ({ name: t.name, completed: t.completed, total: t.total }))}
              />
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-sm">
                    <thead className="bg-[var(--panel-strong)]/60 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                      <tr>
                        <th className="px-4 py-2.5">Technician</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Jobs</th>
                        <th className="px-4 py-2.5">Done</th>
                        <th className="px-4 py-2.5">Open</th>
                        <th className="px-4 py-2.5">Rate</th>
                        <th className="px-4 py-2.5">Avg Time</th>
                        <th className="px-4 py-2.5">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {techPerf.map((tech) => (
                        <tr key={tech.name} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/40">
                          <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{tech.name}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tech.role === "TECHNICIAN_EXTERNAL" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                              {tech.role === "TECHNICIAN_EXTERNAL" ? "Ext" : "Int"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">{tech.total}</td>
                          <td className="px-4 py-2.5 font-semibold text-[var(--accent)]">{tech.completed}</td>
                          <td className="px-4 py-2.5">{tech.open}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-semibold ${tech.completionRate >= 70 ? "text-emerald-600" : tech.completionRate >= 40 ? "text-amber-600" : "text-red-500"}`}>
                              {tech.completionRate.toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5">{tech.avgTurnaround > 0 ? `${tech.avgTurnaround.toFixed(0)}h` : "—"}</td>
                          <td className="px-4 py-2.5">{formatMoneyCompact(tech.revenue, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* 5. DEVICE ANALYTICS */}
      {/* Mobile */}
      <PersistedDisclosure
        title="Device Performance Drill-down"
        storageKey="reports.deviceDrilldown"
        groupName="reports-mobile-sections"
        className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
      >
        <div className="space-y-2">
          {deviceInsights.map((row) => (
            <details key={`${row.device}-mobile`} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
              <summary className="list-none">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink)]">{row.device}</p>
                  <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]">{row.total} jobs</span>
                </div>
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-[var(--ink-muted)]">Open</p><p className="font-semibold">{row.open}</p></div>
                <div><p className="text-[var(--ink-muted)]">Completed</p><p className="font-semibold">{row.completed}</p></div>
                <div><p className="text-[var(--ink-muted)]">Closed</p><p className="font-semibold">{row.cancelledOrClosed}</p></div>
                <div><p className="text-[var(--ink-muted)]">Revenue</p><p className="font-semibold">{formatMoney(row.revenue, currency)}</p></div>
              </div>
            </details>
          ))}
        </div>
      </PersistedDisclosure>

      {/* Desktop */}
      <div className="panel-shadow hidden overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:block">
        <div className="flex items-center justify-between gap-2 p-5 pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Device Analytics</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">Device Performance Drill-down ({selectedMonthString})</p>
          </div>
        </div>
        {deviceInsights.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--ink-muted)]">No jobs found for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[var(--panel-strong)]/60 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Device</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Open</th>
                  <th className="px-4 py-2.5">Completed</th>
                  <th className="px-4 py-2.5">Closed</th>
                  <th className="px-4 py-2.5">Rate</th>
                  <th className="px-4 py-2.5">Avg Time</th>
                  <th className="px-4 py-2.5">Revenue</th>
                  <th className="px-4 py-2.5">Margin</th>
                  <th className="px-4 py-2.5">Avg Margin</th>
                  <th className="px-4 py-2.5">Path Split</th>
                  <th className="px-4 py-2.5">Top Tech</th>
                  <th className="px-4 py-2.5">6-Mo Trend</th>
                </tr>
              </thead>
              <tbody>
                {deviceInsights.map((row) => (
                  <tr key={row.device} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/40">
                    <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{row.device}</td>
                    <td className="px-4 py-2.5">{row.total}</td>
                    <td className="px-4 py-2.5">{row.open}</td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--accent)]">{row.completed}</td>
                    <td className="px-4 py-2.5">{row.cancelledOrClosed}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-semibold ${row.completionRate >= 70 ? "text-emerald-600" : row.completionRate >= 40 ? "text-amber-600" : "text-red-500"}`}>
                        {row.completionRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{row.avgTurnaroundHours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5">{formatMoney(row.revenue, currency)}</td>
                    <td className={`px-3 py-2.5 font-semibold ${row.margin >= 0 ? "text-[var(--accent)]" : "text-red-500"}`}>
                      {formatMoney(row.margin, currency)}
                    </td>
                    <td className="px-4 py-2.5">{formatMoney(row.avgMarginPerCompleted, currency)}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)]">{row.ext}ext / {row.inHouse}in</td>
                    <td className="px-4 py-2.5">{row.topTech}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg width="68" height="28" viewBox="0 0 68 28" className="overflow-visible">
                          {(() => {
                            const max = Math.max(...row.trend, 1);
                            const points = row.trend
                              .map((value, index) => {
                                const x = (index / Math.max(row.trend.length - 1, 1)) * 64 + 2;
                                const y = 24 - (value / max) * 20;
                                return `${x},${y}`;
                              })
                              .join(" ");
                            return <polyline points={points} fill="none" stroke="#D4AF37" strokeWidth="2" />;
                          })()}
                        </svg>
                        <span className={`text-xs font-semibold ${(row.trend[row.trend.length - 1] ?? 0) - (row.trend[0] ?? 0) >= 0 ? "text-[var(--accent)]" : "text-red-500"}`}>
                          {(row.trend[row.trend.length - 1] ?? 0) - (row.trend[0] ?? 0) >= 0 ? "+" : ""}
                          {(row.trend[row.trend.length - 1] ?? 0) - (row.trend[0] ?? 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. RISK DASHBOARD — 2 col */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left: Aging Alerts */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Aging Alerts</p>
          <p className="mb-3 text-sm font-semibold text-[var(--ink)]">Open Jobs by Delay Band</p>
          {agingRows.length === 0 ? (
            <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-3 text-sm text-[var(--ink-muted)]">
              No aging alerts. Open queue is healthy.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                <span>Status</span>
                <span className="text-center">3–7 days</span>
                <span className="text-center">8+ days</span>
              </div>
              {agingRows.map((row) => (
                <div key={row.status} className="grid grid-cols-3 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                  <span className="font-medium text-[var(--ink)] truncate">{statusLabel[normalizeJobStatus(row.status as JobStatus)] ?? row.status}</span>
                  <span className={`text-center font-semibold ${row.threeToSeven > 0 ? "text-amber-600" : "text-[var(--ink-muted)]"}`}>{row.threeToSeven}</span>
                  <span className={`text-center font-semibold ${row.eightPlus > 0 ? "text-red-500" : "text-[var(--ink-muted)]"}`}>{row.eightPlus}</span>
                </div>
              ))}
              {delayedJobs.length > 0 ? (
                <p className="pt-1 text-[10px] text-[var(--ink-muted)]">
                  Oldest: {delayedJobs.map((job) => `${job.jobNumber} (${job.ageDays}d)`).join(", ")}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Right: Repair Funnel */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Repair Funnel</p>
          <p className="mb-3 text-sm font-semibold text-[var(--ink)]">Pipeline Status Breakdown</p>
          <div className="space-y-2">
            {[
              { label: "Diagnosing", value: funnel.diagnosing, href: "/jobs?status=DIAGNOSING" },
              { label: "Awaiting Approval", value: funnel.awaitingApproval, href: "/jobs?status=AWAITING_APPROVAL" },
              { label: "In Repair", value: funnel.inRepair, href: "/jobs?status=IN_REPAIR" },
              { label: "Ready for Pickup", value: funnel.readyForPickup, href: "/jobs?status=READY_FOR_PICKUP" },
              { label: "Completed (all time)", value: funnel.completed, href: "/jobs?status=COMPLETED" },
            ].map((step) => {
              const max = Math.max(funnel.diagnosing, funnel.awaitingApproval, funnel.inRepair, funnel.readyForPickup, funnel.completed, 1);
              const pct = Math.round((step.value / max) * 100);
              return (
                <Link
                  key={step.label}
                  href={step.href}
                  className="group relative flex items-center justify-between overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 transition hover:border-[var(--accent)]/40"
                >
                  <div className="absolute inset-0 left-0" style={{ width: `${pct}%`, background: "var(--accent)", opacity: 0.08 }} />
                  <span className="relative text-xs font-medium text-[var(--ink)]">{step.label}</span>
                  <span className="relative text-sm font-bold text-[var(--ink)]">{step.value}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile risk section */}
      <PersistedDisclosure
        title="Operational Risks"
        storageKey="reports.operationalRisks"
        groupName="reports-mobile-sections"
        className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="mb-2 text-sm font-semibold">Aging Alerts</p>
            {agingRows.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No aging alerts. Open queue is healthy.</p>
            ) : (
              <div className="space-y-2">
                {agingRows.map((row) => (
                  <div key={`mobile-${row.status}`} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                    <p className="font-medium">{row.status}</p>
                    <p className="text-[var(--ink-muted)]">3-7 days: {row.threeToSeven} • 8+ days: {row.eightPlus}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
            <p className="mb-2 text-sm font-semibold">Repair Funnel</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Diagnosing</span><span className="font-semibold">{funnel.diagnosing}</span></div>
              <div className="flex items-center justify-between"><span>Awaiting approval</span><span className="font-semibold">{funnel.awaitingApproval}</span></div>
              <div className="flex items-center justify-between"><span>In repair</span><span className="font-semibold">{funnel.inRepair}</span></div>
              <div className="flex items-center justify-between"><span>Ready for pickup</span><span className="font-semibold">{funnel.readyForPickup}</span></div>
              <div className="flex items-center justify-between"><span>Completed</span><span className="font-semibold text-[var(--accent)]">{funnel.completed}</span></div>
            </div>
          </div>
        </div>
      </PersistedDisclosure>

      {/* 7. APPROVAL QUEUE */}
      {approvalDelays.length > 0 ? (
        <>
          {/* Mobile */}
          <PersistedDisclosure
            title="Approval Delays"
            storageKey="reports.approvalDelays"
            groupName="reports-mobile-sections"
            className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 lg:hidden"
          >
            <div className="space-y-2">
              {approvalDelays.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm hover:border-[var(--accent)]/30">
                  <div className="min-w-0">
                    <p className="mono truncate font-bold text-[var(--accent)]">{job.jobNumber}</p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">{[job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") || "Device"}</p>
                  </div>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${job.daysPending >= 3 ? "bg-amber-50 text-amber-700" : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                    {job.daysPending}d waiting
                  </span>
                </Link>
              ))}
            </div>
          </PersistedDisclosure>

          {/* Desktop */}
          <div className="panel-shadow hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 lg:block">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Approval Queue</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">Jobs currently awaiting client approval</p>
              </div>
              <Link href="/jobs?status=AWAITING_APPROVAL" className="btn-premium-secondary rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)] transition hover:border-[var(--accent)]/30 hover:text-[var(--accent)]">
                View all →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--panel-strong)]/60 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-4 py-2.5">Job #</th>
                    <th className="px-4 py-2.5">Device</th>
                    <th className="px-4 py-2.5">Received</th>
                    <th className="px-4 py-2.5">Last Updated</th>
                    <th className="px-4 py-2.5">Days Waiting</th>
                    <th className="px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalDelays.map((job) => (
                    <tr key={job.id} className="border-t border-[var(--line)] hover:bg-[var(--panel-strong)]/50">
                      <td className="px-4 py-2.5">
                        <Link href={`/jobs/${job.id}`} className="mono font-bold text-[var(--ink)] transition-colors hover:text-[var(--accent)]">{job.jobNumber}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{[job.brand, job.model].filter(v => v && v !== "Unknown").join(" ") || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{job.receivedAt.toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-[var(--ink-muted)]">{job.updatedAt.toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${job.daysPending >= 3 ? "bg-amber-50 text-amber-700" : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"}`}>
                          {job.daysPending}d
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--accent)] hover:underline">Open →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* 8. INTELLIGENCE FEED — 2 col */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left: Fault Keywords */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Intelligence Feed</p>
          <p className="mb-3 text-sm font-semibold text-[var(--ink)]">Most Common Fault Keywords</p>
          {commonFaults.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No diagnosis text available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {commonFaults.map(([word, count]) => (
                <span key={word} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
                  {word}
                  <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: Top Device Types */}
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Intelligence Feed</p>
          <p className="mb-3 text-sm font-semibold text-[var(--ink)]">Top Device Types</p>
          <div className="space-y-2.5">
            {(() => {
              const maxVal = Math.max(...topDevices.map(d => d.value), 1);
              return topDevices.map(item => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-[var(--ink-muted)]">{item.name}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-[var(--panel-strong)] h-1.5">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(item.value / maxVal) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold text-[var(--ink)]">{item.value}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* 9. EXPORT CENTER */}
      <section id="export-center" className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Export Center</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">Download CSV reports for this period</p>
          </div>
          <span className="rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">CSV</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {exportItems.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="group rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 transition hover:-translate-y-[1px] hover:border-[var(--accent)]/40"
            >
              <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{item.caption}</p>
              <p className="mt-2 text-xs font-medium text-[var(--accent)] group-hover:underline">Download CSV →</p>
            </a>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Annual Packages</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {annualExportPackages.map((item) => (
              <Link key={item.title} href={item.href} className="group rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 transition hover:border-[var(--accent)]/30">
                <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{item.caption}</p>
                <p className="mt-2 text-xs font-medium text-[var(--accent)] group-hover:underline">Open package view →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 10. INSIGHT FOOTER */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-xs text-[var(--ink-muted)]">
        <span className="font-medium text-[var(--ink)]">Margin health:</span>{" "}
        {marginSelected >= 0
          ? `Positive margin of ${formatMoneyCompact(marginSelected, currency)} for ${selectedMonthString}.`
          : `Negative margin of ${formatMoneyCompact(Math.abs(marginSelected), currency)} for ${selectedMonthString}.`}
        {user.role === "ADMIN" ? (
          <>
            {" "}Use{" "}
            <Link href="#export-center" className="text-[var(--accent)] hover:underline">
              Repair Margin CSV
            </Link>
            {" "}above to investigate client bill vs external tech bill variance.
          </>
        ) : (
          <> Use Pipeline Aging and Device Performance CSVs to drill into operational bottlenecks.</>
        )}
      </div>

    </div>
  );
}
