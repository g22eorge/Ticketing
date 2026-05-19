import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, JobStatus, InvoiceStatus, SupplierBillStatus } from "@prisma/client";

import { resolveTechCost } from "@/lib/billing";
import { formatMoneyCompact, getAppCurrency } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";

type SearchParams = {
  q?: string;
  tech?: string;
  page?: string;
  section?: string;
};

const PAGE_SIZE = 20;
const TERMINAL = ["READY_FOR_PICKUP", "COMPLETED", "DELIVERED"] as JobStatus[];
const UNPAID_BILL_STATUSES = ["POSTED", "PART_PAID"] as SupplierBillStatus[];
const UNPAID_INV_STATUSES = ["ISSUED"] as InvoiceStatus[];

function buildJobSearch(q?: string): Prisma.JobWhereInput {
  if (!q) return {};
  return {
    OR: [
      { jobNumber: { contains: q } },
      { client: { fullName: { contains: q } } },
      { assignedTo: { is: { name: { contains: q } } } },
    ],
  };
}

function buildInvoiceSearch(q?: string): Prisma.InvoiceWhereInput {
  if (!q) return {};
  return {
    OR: [
      { invoiceNumber: { contains: q } },
      { client: { fullName: { contains: q } } },
      { subject: { contains: q } },
    ],
  };
}

function buildBillSearch(q?: string): Prisma.SupplierBillWhereInput {
  if (!q) return {};
  return {
    OR: [
      { billNumber: { contains: q } },
      { supplier: { name: { contains: q } } },
    ],
  };
}

function daysOverdue(date: Date | null): number | null {
  if (!date) return null;
  const diff = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return diff > 0 ? diff : null;
}

export default async function PayoutFollowupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, orgId } = await requireOrgSession();

  const canSeeRepairs = can.approveInvoices(user) || can.reviewExternalBills(user);
  const canSeeInvoices = can.approveInvoices(user);
  const canSeeBills = can.approveInvoices(user) || can.runFinancialReports(user);

  if (!canSeeRepairs && !canSeeInvoices && !canSeeBills) {
    redirect("/dashboard");
  }

  const filters = await searchParams;
  const page = Math.max(Number(filters.page ?? "1") || 1, 1);
  const currency = getAppCurrency();
  const jobSearch = buildJobSearch(filters.q);
  const invSearch = buildInvoiceSearch(filters.q);
  const billSearch = buildBillSearch(filters.q);
  const techFilter = filters.tech ? { assignedToId: filters.tech } : {};

  // ── Repair collections ────────────────────────────────────────────────────
  const clientWhere: Prisma.JobWhereInput = {
    orgId,
    clientBill: { gt: 0 },
    clientPaid: false,
    status: { in: TERMINAL },
    ...jobSearch,
    ...techFilter,
  };

  // ── External tech payouts ─────────────────────────────────────────────────
  const techWhere: Prisma.JobWhereInput = {
    orgId,
    repairPath: "EXTERNAL",
    externalPaid: false,
    status: { in: TERMINAL },
    ...jobSearch,
    ...techFilter,
  };

  // ── Invoice receivables ───────────────────────────────────────────────────
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    orgId,
    status: { in: UNPAID_INV_STATUSES },
    ...invSearch,
  };

  // ── Supplier bills payable ────────────────────────────────────────────────
  const billWhere: Prisma.SupplierBillWhereInput = {
    orgId,
    status: { in: UNPAID_BILL_STATUSES },
    ...billSearch,
  };

  const [
    clientRows, clientTotal,
    techRows, techTotal,
    invoiceRows, invoiceTotal,
    billRows, billTotal,
    technicians,
    // Summary aggregates (unfiltered for header cards)
    repairSummary,
    techSummary,
    invoiceSummary,
    billSummary,
  ] = await Promise.all([
    // Repair client rows
    canSeeRepairs ? prisma.job.findMany({
      where: clientWhere,
      orderBy: [{ deliveredAt: "desc" }, { completedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, jobNumber: true, status: true, repairPath: true,
        clientBill: true, externalTechFee: true, externalTechBill: true,
        completedAt: true, deliveredAt: true,
        client: { select: { fullName: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }) : Promise.resolve([]),
    canSeeRepairs ? prisma.job.count({ where: clientWhere }) : Promise.resolve(0),

    // External tech rows
    canSeeRepairs ? prisma.job.findMany({
      where: techWhere,
      orderBy: [{ deliveredAt: "desc" }, { completedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, jobNumber: true, status: true,
        clientBill: true, externalTechFee: true, externalTechBill: true,
        completedAt: true, deliveredAt: true,
        client: { select: { fullName: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }) : Promise.resolve([]),
    canSeeRepairs ? prisma.job.count({ where: techWhere }) : Promise.resolve(0),

    // Invoice rows
    canSeeInvoices ? prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: [{ dueDate: "asc" }, { issuedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, invoiceNumber: true, invoiceType: true, subject: true,
        status: true, totalAmount: true, paidAmount: true,
        dueDate: true, issuedAt: true,
        client: { select: { fullName: true, phone: true } },
      },
    }) : Promise.resolve([]),
    canSeeInvoices ? prisma.invoice.count({ where: invoiceWhere }) : Promise.resolve(0),

    // Supplier bill rows
    canSeeBills ? prisma.supplierBill.findMany({
      where: billWhere,
      orderBy: [{ dueAt: "asc" }, { issuedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, billNumber: true, status: true,
        totalAmount: true, paidAmount: true,
        dueAt: true, issuedAt: true,
        supplier: { select: { name: true } },
      },
    }) : Promise.resolve([]),
    canSeeBills ? prisma.supplierBill.count({ where: billWhere }) : Promise.resolve(0),

    // Technician filter options
    prisma.user.findMany({
      where: { orgId, role: { in: ["TECHNICIAN_EXTERNAL", "TECHNICIAN_INTERNAL"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),

    // Summary aggregates (unfiltered)
    canSeeRepairs ? prisma.job.aggregate({
      where: { orgId, clientBill: { gt: 0 }, clientPaid: false, status: { in: TERMINAL } },
      _sum: { clientBill: true },
      _count: { id: true },
    }) : Promise.resolve({ _sum: { clientBill: null }, _count: { id: 0 } }),
    canSeeRepairs ? prisma.job.aggregate({
      where: { orgId, repairPath: "EXTERNAL", externalPaid: false, status: { in: TERMINAL } },
      _sum: { externalTechFee: true, externalTechBill: true },
      _count: { id: true },
    }) : Promise.resolve({ _sum: { externalTechFee: null, externalTechBill: null }, _count: { id: 0 } }),
    canSeeInvoices ? prisma.invoice.aggregate({
      where: { orgId, status: { in: UNPAID_INV_STATUSES } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: { id: true },
    }) : Promise.resolve({ _sum: { totalAmount: null, paidAmount: null }, _count: { id: 0 } }),
    canSeeBills ? prisma.supplierBill.aggregate({
      where: { orgId, status: { in: UNPAID_BILL_STATUSES } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: { id: true },
    }) : Promise.resolve({ _sum: { totalAmount: null, paidAmount: null }, _count: { id: 0 } }),
  ]);

  // Compute summary values
  const repairReceivable = repairSummary._sum.clientBill ?? 0;
  const techPayoutDue = (techSummary._count.id > 0)
    ? (() => {
        // We need to compute resolveTechCost across aggregate — approximate via fee sum
        return (techSummary._sum.externalTechBill ?? techSummary._sum.externalTechFee ?? 0);
      })()
    : 0;
  const invoiceReceivable = (invoiceSummary._sum.totalAmount ?? 0) - (invoiceSummary._sum.paidAmount ?? 0);
  const billPayable = (billSummary._sum.totalAmount ?? 0) - (billSummary._sum.paidAmount ?? 0);

  // Pagination (per section, shared page param for simplicity)
  const preserved = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => k !== "page" && typeof v === "string" && v.length > 0),
  ) as Record<string, string>;

  const allPages = [
    Math.ceil(clientTotal / PAGE_SIZE),
    Math.ceil(techTotal / PAGE_SIZE),
    Math.ceil(invoiceTotal / PAGE_SIZE),
    Math.ceil(billTotal / PAGE_SIZE),
  ].filter(Boolean);
  const totalPages = Math.max(...allPages, 1);
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  const thClass = "px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink-muted)]";
  const tdClass = "px-4 py-2.5";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Finance</p>
            <p className="text-base font-semibold text-[var(--ink)]">Business Finance Hub</p>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Receivables, payables, and tech payouts across all revenue streams.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSeeRepairs && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                {repairSummary._count.id} repair{repairSummary._count.id !== 1 ? "s" : ""} owed · {formatMoneyCompact(repairReceivable, currency)}
              </div>
            )}
            {canSeeInvoices && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400">
                {invoiceSummary._count.id} invoice{invoiceSummary._count.id !== 1 ? "s" : ""} outstanding · {formatMoneyCompact(invoiceReceivable, currency)}
              </div>
            )}
            {canSeeBills && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
                {billSummary._count.id} bill{billSummary._count.id !== 1 ? "s" : ""} payable · {formatMoneyCompact(billPayable, currency)}
              </div>
            )}
            {canSeeRepairs && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
                {techSummary._count.id} tech payout{techSummary._count.id !== 1 ? "s" : ""} pending
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 text-xs">
        {canSeeInvoices && (
          <Link href="/documents/invoices" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
            → All Invoices
          </Link>
        )}
        {canSeeBills && (
          <Link href="/inventory/supplier-bills" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
            → Supplier Bills
          </Link>
        )}
        {canSeeRepairs && (
          <Link href="/jobs" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
            → All Jobs
          </Link>
        )}
        <Link href="/finance/accounts" className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
          → Finance Dashboard
        </Link>
      </div>

      {/* Filters */}
      <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search job #, client, invoice #, supplier…"
            className="min-w-[240px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/40"
          />
          {canSeeRepairs && (
            <select name="tech" defaultValue={filters.tech} className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-sm">
              <option value="">All technicians</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          )}
          <button type="submit" className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">Apply</button>
          <Link href="/payout-followups" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">Reset</Link>
        </form>
      </section>

      {/* ── Section 1: Invoice Receivables ─────────────────────────────────── */}
      {canSeeInvoices && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
            <p className="text-sm font-semibold text-[var(--ink)]">Invoice Receivables — Outstanding</p>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
              {invoiceTotal}
            </span>
          </div>
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {invoiceRows.length === 0 ? (
              <p className="p-4 text-sm text-[var(--ink-muted)]">
                {filters.q ? "No results for this search." : "No outstanding invoices — all settled."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-[var(--panel-strong)]/50">
                    <tr>
                      <th className={thClass}>Invoice #</th>
                      <th className={thClass}>Client</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Subject</th>
                      <th className={thClass}>Total</th>
                      <th className={thClass}>Paid</th>
                      <th className={thClass}>Balance</th>
                      <th className={thClass}>Due Date</th>
                      <th className={thClass}>Overdue</th>
                      <th className={thClass}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map((inv) => {
                      const balance = inv.totalAmount - inv.paidAmount;
                      const overdueDays = daysOverdue(inv.dueDate);
                      return (
                        <tr key={inv.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                          <td className={`${tdClass} font-semibold`}>
                            <Link href={`/documents/invoices/${inv.id}`} className="hover:text-[var(--accent)] transition-colors">
                              {inv.invoiceNumber}
                            </Link>
                          </td>
                          <td className={tdClass}>
                            <p className="font-medium">{inv.client?.fullName ?? "—"}</p>
                            <p className="text-xs text-[var(--ink-muted)]">{inv.client?.phone ?? ""}</p>
                          </td>
                          <td className={tdClass}>
                            <span className="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                              {inv.invoiceType.toLowerCase()}
                            </span>
                          </td>
                          <td className={`${tdClass} max-w-[180px] truncate text-[var(--ink-muted)]`}>{inv.subject ?? "—"}</td>
                          <td className={tdClass}>{formatMoneyCompact(inv.totalAmount, currency)}</td>
                          <td className={tdClass}>
                            {inv.paidAmount > 0 ? (
                              <span className="text-emerald-700 dark:text-emerald-400">{formatMoneyCompact(inv.paidAmount, currency)}</span>
                            ) : <span className="text-[var(--ink-muted)]">—</span>}
                          </td>
                          <td className={`${tdClass} font-semibold text-violet-700 dark:text-violet-400`}>
                            {formatMoneyCompact(balance, currency)}
                          </td>
                          <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                            {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                          </td>
                          <td className={tdClass}>
                            {overdueDays != null ? (
                              <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                {overdueDays}d overdue
                              </span>
                            ) : (
                              <span className="text-[var(--ink-muted)] text-xs">On time</span>
                            )}
                          </td>
                          <td className={tdClass}>
                            <Link href={`/documents/invoices/${inv.id}`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
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
        </section>
      )}

      {/* ── Section 2: Repair Client Collections ───────────────────────────── */}
      {canSeeRepairs && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
            <p className="text-sm font-semibold text-[var(--ink)]">Repair Client Payments — Outstanding</p>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              {clientTotal}
            </span>
          </div>
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {clientRows.length === 0 ? (
              <p className="p-4 text-sm text-[var(--ink-muted)]">
                {filters.q || filters.tech ? "No results for these filters." : "All repair client payments are settled."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-[var(--panel-strong)]/50">
                    <tr>
                      <th className={thClass}>Job</th>
                      <th className={thClass}>Client</th>
                      <th className={thClass}>Assigned To</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Repair Cost</th>
                      <th className={thClass}>Client Bill</th>
                      <th className={thClass}>Done At</th>
                      <th className={thClass}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRows.map((job) => {
                      const doneAt = job.deliveredAt ?? job.completedAt;
                      const repairCost = resolveTechCost(job.externalTechFee, job.externalTechBill);
                      return (
                        <tr key={job.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                          <td className={`${tdClass} font-semibold`}>
                            <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Finance+Hub`} className="hover:text-[var(--accent)] transition-colors">
                              {job.jobNumber}
                            </Link>
                          </td>
                          <td className={tdClass}>
                            <p className="font-medium">{job.client?.fullName ?? "—"}</p>
                            <p className="text-xs text-[var(--ink-muted)]">{job.client?.phone ?? "—"}</p>
                          </td>
                          <td className={tdClass}>{job.assignedTo?.name ?? "Unassigned"}</td>
                          <td className={tdClass}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${job.repairPath === "EXTERNAL" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>
                              {job.repairPath === "EXTERNAL" ? "External" : "In-house"}
                            </span>
                          </td>
                          <td className={tdClass}>
                            {repairCost > 0 ? formatMoneyCompact(repairCost, currency) : <span className="text-[var(--ink-muted)]">—</span>}
                          </td>
                          <td className={`${tdClass} font-semibold text-amber-700 dark:text-amber-400`}>
                            {formatMoneyCompact(job.clientBill ?? 0, currency)}
                          </td>
                          <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                            {doneAt ? new Date(doneAt).toLocaleDateString() : "—"}
                          </td>
                          <td className={tdClass}>
                            <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Finance+Hub`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
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
        </section>
      )}

      {/* ── Section 3: Supplier Bills Payable ──────────────────────────────── */}
      {canSeeBills && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
            <p className="text-sm font-semibold text-[var(--ink)]">Supplier Bills — Payable</p>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
              {billTotal}
            </span>
          </div>
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {billRows.length === 0 ? (
              <p className="p-4 text-sm text-[var(--ink-muted)]">
                {filters.q ? "No results for this search." : "No outstanding supplier bills — all settled."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-[var(--panel-strong)]/50">
                    <tr>
                      <th className={thClass}>Bill #</th>
                      <th className={thClass}>Supplier</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Total</th>
                      <th className={thClass}>Paid</th>
                      <th className={thClass}>Balance</th>
                      <th className={thClass}>Due</th>
                      <th className={thClass}>Overdue</th>
                      <th className={thClass}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billRows.map((bill) => {
                      const balance = bill.totalAmount - bill.paidAmount;
                      const overdueDays = daysOverdue(bill.dueAt);
                      return (
                        <tr key={bill.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                          <td className={`${tdClass} font-semibold`}>
                            <Link href={`/inventory/supplier-bills/${bill.id}`} className="hover:text-[var(--accent)] transition-colors">
                              {bill.billNumber}
                            </Link>
                          </td>
                          <td className={tdClass}>{bill.supplier.name}</td>
                          <td className={tdClass}>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              bill.status === "PART_PAID"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                : "bg-[var(--panel-strong)] text-[var(--ink-muted)]"
                            }`}>
                              {bill.status === "PART_PAID" ? "Part paid" : "Posted"}
                            </span>
                          </td>
                          <td className={tdClass}>{formatMoneyCompact(bill.totalAmount, currency)}</td>
                          <td className={tdClass}>
                            {bill.paidAmount > 0 ? (
                              <span className="text-emerald-700 dark:text-emerald-400">{formatMoneyCompact(bill.paidAmount, currency)}</span>
                            ) : <span className="text-[var(--ink-muted)]">—</span>}
                          </td>
                          <td className={`${tdClass} font-semibold text-rose-700 dark:text-rose-400`}>
                            {formatMoneyCompact(balance, currency)}
                          </td>
                          <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                            {bill.dueAt ? new Date(bill.dueAt).toLocaleDateString() : "—"}
                          </td>
                          <td className={tdClass}>
                            {overdueDays != null ? (
                              <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                                {overdueDays}d overdue
                              </span>
                            ) : (
                              <span className="text-[var(--ink-muted)] text-xs">On time</span>
                            )}
                          </td>
                          <td className={tdClass}>
                            <Link href={`/inventory/supplier-bills/${bill.id}`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
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
        </section>
      )}

      {/* ── Section 4: External Tech Payouts ───────────────────────────────── */}
      {canSeeRepairs && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
            <p className="text-sm font-semibold text-[var(--ink)]">External Tech Payouts — Pending</p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
              {techTotal}
            </span>
          </div>
          <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            {techRows.length === 0 ? (
              <p className="p-4 text-sm text-[var(--ink-muted)]">
                {filters.q || filters.tech ? "No results for these filters." : "No pending external tech payouts — all settled."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="bg-[var(--panel-strong)]/50">
                    <tr>
                      <th className={thClass}>Job</th>
                      <th className={thClass}>Client</th>
                      <th className={thClass}>Technician</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Client Bill</th>
                      <th className={thClass}>Payout Due</th>
                      <th className={thClass}>Done At</th>
                      <th className={thClass}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techRows.map((job) => {
                      const payoutDue = resolveTechCost(job.externalTechFee, job.externalTechBill);
                      const doneAt = job.deliveredAt ?? job.completedAt;
                      return (
                        <tr key={job.id} className="border-t border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30">
                          <td className={`${tdClass} font-semibold`}>
                            <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Finance+Hub`} className="hover:text-[var(--accent)] transition-colors">
                              {job.jobNumber}
                            </Link>
                          </td>
                          <td className={tdClass}>
                            <p className="font-medium">{job.client?.fullName ?? "—"}</p>
                            <p className="text-xs text-[var(--ink-muted)]">{job.client?.phone ?? "—"}</p>
                          </td>
                          <td className={tdClass}>{job.assignedTo?.name ?? "Unassigned"}</td>
                          <td className={tdClass}>{job.status}</td>
                          <td className={tdClass}>
                            {typeof job.clientBill === "number" ? formatMoneyCompact(job.clientBill, currency) : "—"}
                          </td>
                          <td className={`${tdClass} font-semibold text-blue-700 dark:text-blue-400`}>
                            {formatMoneyCompact(payoutDue, currency)}
                          </td>
                          <td className={`${tdClass} text-xs text-[var(--ink-muted)]`}>
                            {doneAt ? new Date(doneAt).toLocaleDateString() : "—"}
                          </td>
                          <td className={tdClass}>
                            <Link href={`/jobs/${job.id}?tab=financials&returnTo=/payout-followups&returnLabel=Finance+Hub`} className="btn-premium-secondary rounded-lg px-3 py-1.5 text-sm">
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
        </section>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`?${new URLSearchParams({ ...preserved, page: String(prevPage) }).toString()}`}
            aria-disabled={page <= 1}
            className={`btn-premium-secondary rounded-lg px-3 py-1.5 text-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            Prev
          </Link>
          <span className="text-xs text-[var(--ink-muted)]">Page {page} / {totalPages}</span>
          <Link
            href={`?${new URLSearchParams({ ...preserved, page: String(nextPage) }).toString()}`}
            aria-disabled={page >= totalPages}
            className={`btn-premium-secondary rounded-lg px-3 py-1.5 text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
