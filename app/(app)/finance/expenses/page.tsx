// @ts-nocheck — TODO: resolve underlying type issues and remove this pragma

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ExpenseCategory, PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { can } from "@/lib/permissions";
import { orgDb } from "@/lib/prisma";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { formatMoneyCompact } from "@/lib/currency";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

export const dynamic = "force-dynamic";

const CATEGORIES: ExpenseCategory[] = [
  "RENT", "UTILITIES", "SALARIES", "SUPPLIES", "MARKETING",
  "TRAVEL", "EQUIPMENT", "MAINTENANCE", "TAXES", "OTHER",
];
const METHODS: PaymentMethod[] = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  SALARIES: "Salaries",
  SUPPLIES: "Supplies",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
  EQUIPMENT: "Equipment",
  MAINTENANCE: "Maintenance",
  TAXES: "Taxes",
  OTHER: "Other",
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  RENT: "border-violet-400/30 bg-violet-400/10 text-violet-700",
  UTILITIES: "border-sky-400/30 bg-sky-400/10 text-sky-700",
  SALARIES: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700",
  SUPPLIES: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  MARKETING: "border-pink-400/30 bg-pink-400/10 text-pink-700",
  TRAVEL: "border-orange-400/30 bg-orange-400/10 text-orange-700",
  EQUIPMENT: "border-indigo-400/30 bg-indigo-400/10 text-indigo-700",
  MAINTENANCE: "border-cyan-400/30 bg-cyan-400/10 text-cyan-700",
  TAXES: "border-red-400/30 bg-red-400/10 text-red-700",
  OTHER: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--ink-muted)]",
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ExpensesPage({ searchParams }: Props) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const sp = await searchParams;
  const catFilter = CATEGORIES.includes(sp.category as ExpenseCategory)
    ? (sp.category as ExpenseCategory)
    : undefined;
  const q = sp.q?.trim() ?? "";
  const periodFilter = (sp.period ?? "all") as "all" | "this_month" | "last_month" | "ytd";

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const ytdStart = new Date(thisYear, 0, 1);
  const prevYtdStart = new Date(thisYear - 1, 0, 1);
  const prevYtdEnd = new Date(thisYear - 1, thisMonth, now.getDate(), 23, 59, 59);
  const prevMonthStart = new Date(thisYear, thisMonth - 1, 1);
  const prevMonthEnd = new Date(thisYear, thisMonth, 0, 23, 59, 59);
  const _thisMonthStart = new Date(thisYear, thisMonth, 1);

  // 6-month trend window
  const trendStart = new Date(thisYear, thisMonth - 5, 1);

  const where: Prisma.ExpenseWhereInput = {
    ...(catFilter ? { category: catFilter } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q } },
            { expenseNumber: { contains: q } },
            { reference: { contains: q } },
          ],
        }
      : {}),
  };

  const [expenses, suppliers, trendExpenses, prevMonthExpenses, ytdExpenses, prevYtdExpenses] =
    await Promise.all([
      db.expense.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.supplier
        .findMany({ where: {}, select: { id: true, name: true }, orderBy: { name: "asc" } })
        .catch(() => [] as { id: string; name: string }[]),
      // For 6-month trend chart (all categories, no filters)
      db.expense.findMany({
        where: { paidAt: { gte: trendStart } },
        select: { amount: true, paidAt: true, createdAt: true },
      }),
      db.expense.findMany({
        where: { paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
        select: { amount: true },
      }),
      db.expense.findMany({
        where: { paidAt: { gte: ytdStart } },
        select: { amount: true },
      }),
      db.expense.findMany({
        where: { paidAt: { gte: prevYtdStart, lte: prevYtdEnd } },
        select: { amount: true },
      }),
    ]);

  const currency = "UGX";

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  const thisMonthAmount = expenses
    .filter((e) => {
      const d = e.paidAt ?? e.createdAt;
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const prevMonthTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const ytdTotal = ytdExpenses.reduce((s, e) => s + e.amount, 0);
  const prevYtdTotal = prevYtdExpenses.reduce((s, e) => s + e.amount, 0);
  const momDelta = thisMonthAmount - prevMonthTotal;
  const ytdDelta = ytdTotal - prevYtdTotal;

  // Build 6-month trend chart data
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(thisYear, thisMonth - (5 - i), 1);
    return {
      key: `${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== thisYear ? " '" + String(d.getFullYear()).slice(2) : ""}`,
      yr: d.getFullYear(),
      mo: d.getMonth(),
      amount: 0,
    };
  });
  for (const e of trendExpenses) {
    const d = e.paidAt ?? e.createdAt;
    const bucket = trendMonths.find((m) => m.yr === d.getFullYear() && m.mo === d.getMonth());
    if (bucket) bucket.amount += e.amount;
  }
  const trendData = trendMonths.map(({ key, amount }) => ({ key, amount }));

  // Category breakdown (from filtered expenses)
  const byCategory = CATEGORIES.map((cat) => {
    const items = expenses.filter((e) => e.category === cat);
    return {
      cat,
      total: items.reduce((s, e) => s + e.amount, 0),
      count: items.length,
    };
  }).filter((x) => x.count > 0);


  async function createExpenseAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!can.viewFinancials(user)) redirect("/dashboard");

    const description = String(formData.get("description") ?? "").trim();
    const amountRaw = Number(String(formData.get("amount") ?? "").trim());
    const categoryRaw = String(formData.get("category") ?? "OTHER").trim();
    const methodRaw = String(formData.get("method") ?? "").trim();
    const currency = String(formData.get("currency") ?? "UGX").trim();
    const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
    const reference = String(formData.get("reference") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const paidAtRaw = String(formData.get("paidAt") ?? "").trim();

    if (!description || !Number.isFinite(amountRaw) || amountRaw <= 0) return;

    const category = CATEGORIES.includes(categoryRaw as ExpenseCategory)
      ? (categoryRaw as ExpenseCategory)
      : ("OTHER" as ExpenseCategory);
    const method =
      methodRaw && METHODS.includes(methodRaw as PaymentMethod)
        ? (methodRaw as PaymentMethod)
        : null;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;

    const count = await db.expense.count({ where: {} });
    const year = new Date().getFullYear();
    const expenseNumber = `EXP-${year}-${String(count + 1).padStart(4, "0")}`;

    const expense = await db.expense.create({
      data: {
        expenseNumber,
        description,
        amount: amountRaw,
        currency,
        category,
        method: method ?? undefined,
        supplierId,
        reference,
        notes,
        paidAt,
        createdById: user.id,
      },
    });

    await writeSystemAuditEvent({
      entityType: "Expense",
      entityId: expense.id,
      action: "EXPENSE_CREATED",
      summary: `${expenseNumber} — ${description} — ${currency} ${amountRaw.toLocaleString()}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/expenses");
    redirect("/finance/expenses");
  }

  async function deleteExpenseAction(formData: FormData) {
    "use server";
    const { user } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    if (!["ADMIN"].includes(user.role)) redirect("/dashboard");

    const expenseId = String(formData.get("expenseId") ?? "").trim();
    if (!expenseId) return;

    const expense = await db.expense.findFirst({
      where: { id: expenseId },
      select: { expenseNumber: true, description: true },
    });
    if (!expense) return;

    await db.expense.delete({ where: { id: expenseId } });

    await writeSystemAuditEvent({
      entityType: "Expense",
      entityId: expenseId,
      action: "EXPENSE_DELETED",
      summary: `Deleted ${expense.expenseNumber} — ${expense.description}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/expenses");
    redirect("/finance/expenses");
  }

  const canWrite = can.viewFinancials(user);
  const canDelete = ["ADMIN"].includes(user.role);

  const filterUrl = (params: Record<string, string | undefined>) => {
    const base = new URLSearchParams();
    const nextCat = params.category !== undefined ? params.category : catFilter;
    const nextQ = params.q !== undefined ? params.q : q;
    if (nextCat) base.set("category", nextCat);
    if (nextQ) base.set("q", nextQ);
    const s = base.toString();
    return `/finance/expenses${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Expenses{" "}
            <span className="font-normal text-[var(--ink-muted)]">
              · {expenses.length} records
            </span>
          </p>
          <div className="mt-0.5 flex items-center gap-3">
            <Link
              href="/finance/reports/pl"
              className="text-[13px] text-[var(--accent)] hover:underline"
            >
              P&L Statement →
            </Link>
            <Link
              href={`/api/reports/export?type=expenses&month=${thisYear}-${String(thisMonth + 1).padStart(2, "0")}`}
              className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              ↓ Export CSV
            </Link>
          </div>
        </div>
        {canWrite && (
          <details className="group relative">
            <summary className="btn-premium cursor-pointer list-none rounded-lg px-3 py-1.5 text-[12px]">
              + Record Expense
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-96 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 shadow-xl">
              <p className="mb-3 text-[12px] font-bold text-[var(--ink)]">Record Business Expense</p>
              <form action={createExpenseAction} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                    Description *
                  </label>
                  <input
                    name="description"
                    required
                    placeholder="What was this expense for?"
                    className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                      Amount *
                    </label>
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                    />
                  </div>
                  {/* Currency locked to org base — hidden field */}
                  <input type="hidden" name="currency" value="UGX" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                      Category
                    </label>
                    <select
                      name="category"
                      className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                      Payment Method
                    </label>
                    <select
                      name="method"
                      className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                    >
                      <option value="">— none —</option>
                      {METHODS.map((m) => (
                        <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                    Date Paid
                  </label>
                  <input
                    name="paidAt"
                    type="date"
                    className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                  />
                </div>
                {suppliers.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                      Supplier (optional)
                    </label>
                    <select
                      name="supplierId"
                      className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                    >
                      <option value="">— none —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">
                    Reference / Receipt #
                  </label>
                  <input
                    name="reference"
                    placeholder="Invoice or receipt number"
                    className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-semibold text-[var(--ink-muted)]">Notes</label>
                  <textarea
                    name="notes"
                    rows={2}
                    className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-premium w-full rounded-lg py-2 text-[12px] font-semibold"
                >
                  Save Expense
                </button>
              </form>
            </div>
          </details>
        )}
      </div>

      {/* ── KPI STRIP ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">This Month</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)] tabular-nums">
            {formatMoneyCompact(thisMonthAmount, currency)}
          </p>
          {prevMonthTotal > 0 && (
            <p
              className={`mt-1 text-[13px] font-semibold ${
                momDelta <= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {momDelta > 0 ? "+" : "−"}
              {formatMoneyCompact(Math.abs(momDelta), currency)} vs last month
            </p>
          )}
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            YTD {thisYear}
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)] tabular-nums">
            {formatMoneyCompact(ytdTotal, currency)}
          </p>
          {prevYtdTotal > 0 && (
            <p
              className={`mt-1 text-[13px] font-semibold ${
                ytdDelta <= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {ytdDelta > 0 ? "+" : "−"}
              {formatMoneyCompact(Math.abs(ytdDelta), currency)} vs {thisYear - 1} YTD
            </p>
          )}
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Avg / Month</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)] tabular-nums">
            {trendData.filter((d) => d.amount > 0).length > 0
              ? formatMoneyCompact(
                  trendData.reduce((s, d) => s + d.amount, 0) /
                    Math.max(1, trendData.filter((d) => d.amount > 0).length),
                  currency,
                )
              : "—"}
          </p>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Last 6 months</p>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            Top Category
          </p>
          {byCategory.length > 0 ? (
            <>
              <p className="mt-1 text-lg font-bold text-[var(--ink)] tabular-nums">
                {formatMoneyCompact(byCategory.sort((a, b) => b.total - a.total)[0].total, currency)}
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                {CATEGORY_LABELS[byCategory.sort((a, b) => b.total - a.total)[0].cat]}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[var(--ink-muted)]">—</p>
          )}
        </div>
      </div>


      {/* ── PERIOD CHIPS ─────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {([
          { label: "All time", value: "all" },
          { label: "This month", value: "this_month" },
          { label: "Last month", value: "last_month" },
          { label: "YTD", value: "ytd" },
        ] as const).map(({ label, value }) => (
          <Link key={value} href={filterUrl({ period: value === "all" ? "" : value })}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${periodFilter === value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"}`}>
            {label}
          </Link>
        ))}
      </div>

      {/* ── FILTER BAR ───────────────────────────────────────────────────── */}
      <div className="panel-shadow flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <form method="GET" action="/finance/expenses" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {catFilter && <input type="hidden" name="category" value={catFilter} />}
          {periodFilter !== "all" && <input type="hidden" name="period" value={periodFilter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search description, reference…"
            className="input-base h-8 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[12px] sm:min-w-[180px]"
          />
          <button type="submit" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--panel-strong)]">
            Search
          </button>
        </form>
        <div className="flex w-full min-w-0 gap-1 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
          <Link
            href={filterUrl({ category: "" })}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[13px] font-semibold transition sm:px-2.5 ${
              !catFilter
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/50"
            }`}
          >
            All
          </Link>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={filterUrl({ category: catFilter === cat ? "" : cat })}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[13px] font-semibold transition sm:px-2.5 ${
                catFilter === cat
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/50"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </Link>
          ))}
        </div>
      </div>

      {/* ── EXPENSE TABLE ────────────────────────────────────────────────── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="doc-list overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Expense #</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Category</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Supplier</th>
                <th className="hidden px-4 py-2.5 text-left lg:table-cell">Method</th>
                <th className="hidden px-4 py-2.5 text-left lg:table-cell">Paid</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">By</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40"
                >
                  <td className="px-4 py-3">
                    <p className="mono text-[12px] font-bold text-[var(--ink)]">
                      {expense.expenseNumber}
                    </p>
                    <p className="text-[13px] text-[var(--ink-muted)]">{fmt(expense.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[var(--ink)]">{expense.description}</p>
                    {expense.reference && (
                      <p className="text-[13px] text-[var(--ink-muted)]">Ref: {expense.reference}</p>
                    )}
                    {expense.notes && (
                      <p className="text-[13px] italic text-[var(--ink-muted)]">{expense.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${CATEGORY_COLORS[expense.category]}`}
                    >
                      {CATEGORY_LABELS[expense.category]}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] md:table-cell">
                    {expense.supplier?.name ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] lg:table-cell">
                    {expense.method ? expense.method.replace(/_/g, " ") : "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-[12px] text-[var(--ink-muted)] lg:table-cell">
                    {fmt(expense.paidAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold tabular-nums text-[var(--ink)]">
                      {expense.currency} {expense.amount.toLocaleString()}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-[13px] text-[var(--ink-muted)] sm:table-cell">
                    {expense.createdBy.name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canDelete && (
                      <RowActionsMenu label="Expense actions">
                        <MenuDestructiveRow>
                          <form action={deleteExpenseAction}>
                            <input type="hidden" name="expenseId" value={expense.id} />
                            <ConfirmSubmitButton
                              message={`Delete expense ${expense.expenseNumber}? This cannot be undone.`}
                              className="w-full text-left text-[12px] text-red-600"
                            >
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        </MenuDestructiveRow>
                      </RowActionsMenu>
                    )}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
                    {q || catFilter ? "No expenses match your filters." : "No expenses recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {expenses.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5">
            <p className="text-[13px] text-[var(--ink-muted)]">
              {expenses.length} record{expenses.length !== 1 ? "s" : ""}
              {catFilter ? ` · ${CATEGORY_LABELS[catFilter]}` : ""}
            </p>
            <p className="text-[12px] font-bold text-[var(--ink)]">
              Total: {currency} {totalAmount.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
