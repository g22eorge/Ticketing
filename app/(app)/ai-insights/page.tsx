// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";

import { BusinessCopilot } from "@/components/ai-insights/BusinessCopilot";
import { getClientBill, resolveTechCost } from "@/lib/billing";
import { formatMoney, formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { getCurrentUserRole } from "@/lib/session";

const OPEN_JOB_STATUSES = [
  "RECEIVED",
  "DIAGNOSING",
  "REFERRED",
  "PENDING_EXTERNAL_ASSIGNMENT",
  "ASSIGNED_ONE_TIME_EXTERNAL",
  "IN_EXTERNAL_REPAIR",
  "WAITING_FOR_PARTS",
  "RETURNED_FROM_EXTERNAL",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "READY_FOR_PICKUP",
] as const;

function monthRange(date: Date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function previousMonthRange(date: Date) {
  return monthRange(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function trendLabel(current: number, previous: number, suffix = "%") {
  const change = pctChange(current, previous);
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}${suffix} vs previous month`;
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function KpiCard({ title, value, caption, tone = "neutral" }: { title: string; value: string; caption: string; tone?: "neutral" | "good" | "risk" }) {
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "risk" ? "text-amber-600" : "text-[var(--accent-text)]";
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{title}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{caption}</p>
    </section>
  );
}

function InsightCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">{title}</p>
      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink)]">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink-muted)]">{empty}</p>
      )}
    </section>
  );
}

export default async function AiInsightsPage() {
  const { user } = await getCurrentUserRole();
  if (!can.viewAccountsSummary(user)) redirect("/dashboard");

  const db = orgDb(user.orgId);
  const now = new Date();
  const current = monthRange(now);
  const previous = previousMonthRange(now);
  const currency = getAppCurrency();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [
    jobsThisMonth,
    jobsPrevMonth,
    completedThisMonth,
    completedPrevMonth,
    openJobs,
    jobsByStatus,
    paidSalesThisMonth,
    paidSalesPrevMonth,
    paidInvoicesThisMonth,
    paidInvoicesPrevMonth,
    openInvoices,
    expensesThisMonth,
    expensesPrevMonth,
    parts,
    openPurchaseOrders,
    supplierBills,
    leadsByStatus,
    salesTargets,
  ] = await Promise.all([
    db.job.count({ where: { receivedAt: { gte: current.start, lte: current.end } } }),
    db.job.count({ where: { receivedAt: { gte: previous.start, lte: previous.end } } }),
    db.job.findMany({
      where: { status: "COMPLETED", completedAt: { gte: current.start, lte: current.end } },
      select: { clientBill: true, externalTechBill: true, externalTechFee: true, completedAt: true, receivedAt: true, repairPath: true },
    }),
    db.job.findMany({
      where: { status: "COMPLETED", completedAt: { gte: previous.start, lte: previous.end } },
      select: { clientBill: true, externalTechBill: true, externalTechFee: true },
    }),
    db.job.findMany({
      where: { status: { in: [...OPEN_JOB_STATUSES] } },
      select: { jobNumber: true, status: true, receivedAt: true, updatedAt: true, repairPath: true },
      orderBy: { receivedAt: "asc" },
      take: 250,
    }),
    db.job.groupBy({ by: ["status"], _count: { status: true } }),
    db.sale.findMany({ where: { status: "PAID", paidAt: { gte: current.start, lte: current.end } }, select: { totalAmount: true } }),
    db.sale.findMany({ where: { status: "PAID", paidAt: { gte: previous.start, lte: previous.end } }, select: { totalAmount: true } }),
    db.invoice.findMany({ where: { status: "PAID", paidAt: { gte: current.start, lte: current.end } }, select: { totalAmount: true } }),
    db.invoice.findMany({ where: { status: "PAID", paidAt: { gte: previous.start, lte: previous.end } }, select: { totalAmount: true } }),
    db.invoice.findMany({
      where: { status: { in: ["DRAFT", "ISSUED"] } },
      select: { invoiceNumber: true, totalAmount: true, paidAmount: true, dueDate: true, issuedAt: true },
      orderBy: { issuedAt: "asc" },
      take: 250,
    }),
    db.expense.aggregate({ where: { paidAt: { gte: current.start, lte: current.end } }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { paidAt: { gte: previous.start, lte: previous.end } }, _sum: { amount: true } }),
    db.part.findMany({ where: { isActive: true }, select: { sku: true, name: true, qtyOnHand: true, reorderLevel: true, unitCost: true } }),
    db.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }),
    db.supplierBill.findMany({
      where: { status: { in: ["POSTED", "PART_PAID"] } },
      select: { billNumber: true, totalAmount: true, paidAmount: true, dueAt: true, supplier: { select: { name: true } } },
      orderBy: { issuedAt: "asc" },
      take: 250,
    }),
    db.lead.groupBy({ by: ["status"], _count: { status: true }, _sum: { estimatedValue: true } }),
    db.salesTarget.aggregate({ where: { period: monthKey }, _sum: { targetRevenue: true, targetValue: true, actualValue: true } }),
  ]);

  const repairRevenue = sum(completedThisMonth.map((job) => getClientBill(job) ?? 0));
  const repairRevenuePrev = sum(completedPrevMonth.map((job) => getClientBill(job) ?? 0));
  const externalRepairCost = sum(completedThisMonth.map((job) => resolveTechCost(job.externalTechFee, job.externalTechBill)));
  const salesRevenue = sum(paidSalesThisMonth.map((sale) => sale.totalAmount));
  const salesRevenuePrev = sum(paidSalesPrevMonth.map((sale) => sale.totalAmount));
  const invoiceRevenue = sum(paidInvoicesThisMonth.map((invoice) => invoice.totalAmount));
  const invoiceRevenuePrev = sum(paidInvoicesPrevMonth.map((invoice) => invoice.totalAmount));
  const totalRevenue = repairRevenue + salesRevenue + invoiceRevenue;
  const totalRevenuePrev = repairRevenuePrev + salesRevenuePrev + invoiceRevenuePrev;
  const expenses = expensesThisMonth._sum.amount ?? 0;
  const expensesPrev = expensesPrevMonth._sum.amount ?? 0;
  const cashMarginSignal = totalRevenue - externalRepairCost - expenses;
  const averageRepairDays = completedThisMonth.length
    ? sum(completedThisMonth.map((job) => daysBetween(job.receivedAt, job.completedAt ?? now))) / completedThisMonth.length
    : 0;
  const lowStockParts = parts.filter((part) => part.reorderLevel > 0 && part.qtyOnHand <= part.reorderLevel);
  const inventoryValue = sum(parts.map((part) => part.qtyOnHand * (part.unitCost ?? 0)));
  const overdueJobs = openJobs.filter((job) => daysBetween(job.receivedAt, now) >= 7);
  const staleJobs = openJobs.filter((job) => daysBetween(job.updatedAt, now) >= 3);
  const awaitingApproval = openJobs.filter((job) => job.status === "AWAITING_APPROVAL");
  const waitingForParts = openJobs.filter((job) => job.status === "WAITING_FOR_PARTS");
  const overdueInvoices = openInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < now);
  const receivables = sum(openInvoices.map((invoice) => Math.max(0, invoice.totalAmount - invoice.paidAmount)));
  const overdueSupplierBills = supplierBills.filter((bill) => bill.dueAt && bill.dueAt < now);
  const payables = sum(supplierBills.map((bill) => Math.max(0, bill.totalAmount - bill.paidAmount)));
  const target = (salesTargets._sum.targetRevenue ?? 0) + (salesTargets._sum.targetValue ?? 0);
  const targetActual = salesTargets._sum.actualValue ?? totalRevenue;
  const targetProgress = target > 0 ? Math.min(999, (targetActual / target) * 100) : null;
  const wonLeads = leadsByStatus.find((lead) => lead.status === "WON")?._count.status ?? 0;
  const openLeads = leadsByStatus
    .filter((lead) => !["WON", "LOST"].includes(lead.status))
    .reduce((count, lead) => count + lead._count.status, 0);
  const pipelineValue = sum(leadsByStatus.map((lead) => lead._sum.estimatedValue ?? 0));

  const risks = [
    overdueJobs.length ? `${overdueJobs.length} open repair job(s) are older than 7 days. Prioritise diagnosis, approvals, parts, or technician reassignment.` : null,
    staleJobs.length ? `${staleJobs.length} open job(s) have not been updated for 3+ days. Ask owners to add notes or move status.` : null,
    awaitingApproval.length ? `${awaitingApproval.length} job(s) are awaiting client approval. Follow up before they become stale.` : null,
    waitingForParts.length ? `${waitingForParts.length} job(s) are waiting for parts. Check low-stock items and pending purchase orders.` : null,
    lowStockParts.length ? `${lowStockParts.length} active part(s) are at or below reorder level. Review Stock Alerts and create purchase requests/orders.` : null,
    overdueInvoices.length ? `${overdueInvoices.length} invoice(s) are overdue. Receivables at risk: ${formatMoneyCompact(receivables, currency)}.` : null,
    overdueSupplierBills.length ? `${overdueSupplierBills.length} supplier bill(s) are overdue. Payables outstanding: ${formatMoneyCompact(payables, currency)}.` : null,
    totalRevenue < totalRevenuePrev ? `Revenue is down ${Math.abs(pctChange(totalRevenue, totalRevenuePrev)).toFixed(1)}% versus last month. Review repair volume, POS sales, invoice collections, and lead follow-up.` : null,
    cashMarginSignal < 0 ? `Cash margin signal is negative after expenses and external repair costs. Reduce discretionary spend or accelerate collections.` : null,
  ].filter((item): item is string => Boolean(item));

  const recommendations = [
    lowStockParts.length ? "Create purchase requests for the most critical low-stock repair parts before accepting jobs that depend on them." : null,
    overdueJobs.length ? "Run a daily stuck-job standup: owner, blocker, next action, and promised client update for every job older than 7 days." : null,
    awaitingApproval.length ? "Assign OPS/front desk to contact clients awaiting approval and record each decision on the job timeline." : null,
    receivables > 0 ? "Prioritise collections by oldest and largest issued invoices; issue receipts immediately after payment." : null,
    openPurchaseOrders ? "Review open purchase orders and confirm expected delivery dates with suppliers." : null,
    openLeads ? "Work the open sales pipeline by next follow-up date; focus first on high estimated-value qualified/proposal leads." : null,
    targetProgress !== null && targetProgress < 80 ? "Sales target progress is below 80%; increase follow-ups, campaigns, and quote conversion reviews this week." : null,
    completedThisMonth.length ? "Compare technician turnaround times and external repair costs before assigning the next batch of work." : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--accent-text)]">AI Decision Intelligence</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--ink)]">Business Insights</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            System-wide decision support across repairs, sales, finance, and inventory. These insights use live tenant-scoped data and are designed to become the data pack for AI-generated reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link href="/reports" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)] hover:border-[var(--accent)]/40">Operations Reports</Link>
          <Link href="/finance/reports" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)] hover:border-[var(--accent)]/40">Finance Reports</Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Revenue Signal" value={formatMoneyCompact(totalRevenue, currency)} caption={trendLabel(totalRevenue, totalRevenuePrev)} tone={totalRevenue >= totalRevenuePrev ? "good" : "risk"} />
        <KpiCard title="Cash Margin Signal" value={formatMoneyCompact(cashMarginSignal, currency)} caption={`Expenses: ${formatMoneyCompact(expenses, currency)} (${trendLabel(expenses, expensesPrev)})`} tone={cashMarginSignal >= 0 ? "good" : "risk"} />
        <KpiCard title="Open Repair Load" value={String(openJobs.length)} caption={`${overdueJobs.length} older than 7 days; ${staleJobs.length} stale updates`} tone={overdueJobs.length ? "risk" : "neutral"} />
        <KpiCard title="Inventory Risk" value={String(lowStockParts.length)} caption={`${formatMoneyCompact(inventoryValue, currency)} stock value; ${openPurchaseOrders} open PO(s)`} tone={lowStockParts.length ? "risk" : "good"} />
      </section>

      <BusinessCopilot />

      <div className="grid gap-4 xl:grid-cols-2">
        <InsightCard title="Risks AI Should Escalate" items={risks} empty="No major cross-module risks detected from the current data." />
        <InsightCard title="Recommended Management Actions" items={recommendations} empty="No immediate management actions detected. Keep monitoring daily activity." />
      </div>

      <section className="grid gap-4 xl:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Repairs</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">New jobs</dt><dd className="font-semibold text-[var(--ink)]">{jobsThisMonth} <span className="text-[10px] font-medium text-[var(--ink-muted)]">({trendLabel(jobsThisMonth, jobsPrevMonth)})</span></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Completed</dt><dd className="font-semibold text-[var(--ink)]">{completedThisMonth.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Avg turnaround</dt><dd className="font-semibold text-[var(--ink)]">{averageRepairDays.toFixed(1)} days</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Repair revenue</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(repairRevenue, currency)}</dd></div>
          </dl>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sales</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">POS sales</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(salesRevenue, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Paid invoices</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(invoiceRevenue, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Open leads</dt><dd className="font-semibold text-[var(--ink)]">{openLeads}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Pipeline value</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(pipelineValue, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Won leads</dt><dd className="font-semibold text-[var(--ink)]">{wonLeads}</dd></div>
          </dl>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Expenses</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(expenses, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Receivables</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(receivables, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Payables</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(payables, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Target progress</dt><dd className="font-semibold text-[var(--ink)]">{targetProgress === null ? "No target" : `${targetProgress.toFixed(1)}%`}</dd></div>
          </dl>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Inventory</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Active parts</dt><dd className="font-semibold text-[var(--ink)]">{parts.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Low stock</dt><dd className="font-semibold text-[var(--ink)]">{lowStockParts.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Stock value</dt><dd className="font-semibold text-[var(--ink)]">{formatMoneyCompact(inventoryValue, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-muted)]">Open POs</dt><dd className="font-semibold text-[var(--ink)]">{openPurchaseOrders}</dd></div>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Job Status Distribution</p>
          <div className="mt-3 space-y-2">
            {jobsByStatus.map((item) => (
              <div key={item.status} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span className="text-[var(--ink-muted)]">{statusLabel(item.status)}</span>
                <span className="font-semibold text-[var(--ink)]">{item._count.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Top Low-Stock Parts</p>
          <div className="mt-3 space-y-2">
            {lowStockParts.slice(0, 8).map((part) => (
              <div key={part.sku} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[var(--ink)]">{part.name}</span>
                <span className="shrink-0 text-[var(--ink-muted)]">{part.qtyOnHand}/{part.reorderLevel}</span>
              </div>
            ))}
            {!lowStockParts.length ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--ink-muted)]">No low-stock parts detected.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
