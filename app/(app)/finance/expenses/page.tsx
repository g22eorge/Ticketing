import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ExpenseCategory, PaymentMethod } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { assertOrgCanMutate } from "@/lib/org-write";
import { writeSystemAuditEvent } from "@/lib/commercial/audit";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";

export const dynamic = "force-dynamic";

const CATEGORIES: ExpenseCategory[] = ["RENT","UTILITIES","SALARIES","SUPPLIES","MARKETING","TRAVEL","EQUIPMENT","MAINTENANCE","TAXES","OTHER"];
const METHODS: PaymentMethod[] = ["CASH","MOBILE_MONEY","BANK_TRANSFER","CARD","OTHER"];

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

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" }) : "—";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ExpensesPage({ searchParams }: Props) {
  const { user, orgId, org } = await requireOrgSession();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const sp = await searchParams;
  const catFilter = CATEGORIES.includes(sp.category as ExpenseCategory)
    ? (sp.category as ExpenseCategory)
    : undefined;
  const q = sp.q?.trim() ?? "";

  const where: Prisma.ExpenseWhereInput = {
    orgId,
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

  const [expenses, suppliers, branches] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.supplier.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [] as { id: string; name: string }[]),
    prisma.branch.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [] as { id: string; name: string }[]),
  ]);

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const now = new Date();
  const thisMonthAmount = expenses
    .filter((e) => {
      const d = e.paidAt ?? e.createdAt;
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
    count: expenses.filter((e) => e.category === cat).length,
  })).filter((x) => x.count > 0);

  async function createExpenseAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!can.viewFinancials(user)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const description = String(formData.get("description") ?? "").trim();
    const amountRaw = Number(String(formData.get("amount") ?? "").trim());
    const categoryRaw = String(formData.get("category") ?? "OTHER").trim();
    const methodRaw = String(formData.get("method") ?? "").trim();
    const currency = String(formData.get("currency") ?? org.baseCurrency ?? "UGX").trim();
    const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
    const branchId = String(formData.get("branchId") ?? "").trim() || null;
    const reference = String(formData.get("reference") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const paidAtRaw = String(formData.get("paidAt") ?? "").trim();

    if (!description || !Number.isFinite(amountRaw) || amountRaw <= 0) return;

    const category = CATEGORIES.includes(categoryRaw as ExpenseCategory)
      ? (categoryRaw as ExpenseCategory)
      : "OTHER" as ExpenseCategory;
    const method =
      methodRaw && METHODS.includes(methodRaw as PaymentMethod)
        ? (methodRaw as PaymentMethod)
        : null;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;

    const count = await prisma.expense.count({ where: { orgId } });
    const year = new Date().getFullYear();
    const expenseNumber = `EXP-${year}-${String(count + 1).padStart(4, "0")}`;

    const expense = await prisma.expense.create({
      data: {
        orgId,
        expenseNumber,
        description,
        amount: amountRaw,
        currency,
        category,
        method: method ?? undefined,
        supplierId,
        branchId,
        reference,
        notes,
        paidAt,
        createdById: user.id,
      },
    });

    await writeSystemAuditEvent({
      orgId,
      entityType: "Expense",
      entityId: expense.id,
      action: "EXPENSE_CREATED",
      summary: `${expenseNumber} — ${description} — ${currency} ${amountRaw.toLocaleString()}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/expenses");
  }

  async function deleteExpenseAction(formData: FormData) {
    "use server";
    const { user, orgId, org } = await requireOrgSession();
    if (!["ADMIN", "MANAGER"].includes(user.role)) redirect("/dashboard");
    assertOrgCanMutate({ access: org.access, userRole: user.role, userAccessMode: user.accessMode, kind: "GENERAL" });

    const expenseId = String(formData.get("expenseId") ?? "").trim();
    if (!expenseId) return;

    const expense = await prisma.expense.findFirst({ where: { id: expenseId, orgId }, select: { expenseNumber: true, description: true } });
    if (!expense) return;

    await prisma.expense.delete({ where: { id: expenseId } });

    await writeSystemAuditEvent({
      orgId,
      entityType: "Expense",
      entityId: expenseId,
      action: "EXPENSE_DELETED",
      summary: `Deleted ${expense.expenseNumber} — ${expense.description}`,
      actorUserId: user.id,
    });

    revalidatePath("/finance/expenses");
  }

  const canWrite = can.viewFinancials(user);
  const canDelete = ["ADMIN", "MANAGER"].includes(user.role);
  const currency = org.baseCurrency ?? "UGX";

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
      {/* Header */}
      <div className="panel-shadow flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <div>
          <p className="text-[13px] font-bold text-[var(--ink)]">
            Expenses{" "}
            <span className="font-normal text-[var(--ink-muted)]">
              · {expenses.length} records · {currency} {totalAmount.toLocaleString()} total
            </span>
          </p>
          <p className="text-[11px] text-[var(--ink-muted)]">
            This month: {currency} {thisMonthAmount.toLocaleString()}
          </p>
        </div>
        {canWrite && (
          <details className="group relative">
            <summary className="btn-premium cursor-pointer list-none rounded-lg px-3 py-1.5 text-[12px]">
              + Record Expense
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-96 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-xl">
              <p className="mb-3 text-[12px] font-bold text-[var(--ink)]">Record Business Expense</p>
              <form action={createExpenseAction} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Description *</label>
                  <input name="description" required placeholder="What was this expense for?" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Amount *</label>
                    <input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Currency</label>
                    <input name="currency" defaultValue={currency} className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Category</label>
                    <select name="category" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Payment Method</label>
                    <select name="method" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                      <option value="">— none —</option>
                      {METHODS.map((m) => (
                        <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Date Paid</label>
                  <input name="paidAt" type="date" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
                {suppliers.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Supplier (optional)</label>
                    <select name="supplierId" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                      <option value="">— none —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {branches.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Branch (optional)</label>
                    <select name="branchId" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]">
                      <option value="">— none —</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Reference / Receipt #</label>
                  <input name="reference" placeholder="Invoice or receipt number" className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]">Notes</label>
                  <textarea name="notes" rows={2} className="input-base w-full rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-[12px]" />
                </div>
                <button type="submit" className="btn-premium w-full rounded-lg py-2 text-[12px] font-semibold">
                  Save Expense
                </button>
              </form>
            </div>
          </details>
        )}
      </div>

      {/* KPI strip */}
      {byCategory.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {byCategory.slice(0, 5).map(({ cat, total, count }) => (
            <Link
              key={cat}
              href={filterUrl({ category: catFilter === cat ? "" : cat })}
              className={`panel-shadow rounded-xl border px-3 py-2.5 transition hover:opacity-80 ${catFilter === cat ? "ring-2 ring-[var(--accent)]" : ""} ${CATEGORY_COLORS[cat]}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide">{CATEGORY_LABELS[cat]}</p>
              <p className="mt-1 text-[13px] font-bold tabular-nums">{currency} {total.toLocaleString()}</p>
              <p className="text-[10px] opacity-70">{count} record{count !== 1 ? "s" : ""}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="panel-shadow flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5">
        <form method="GET" action="/finance/expenses" className="flex flex-1 items-center gap-2">
          {catFilter && <input type="hidden" name="category" value={catFilter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search description, reference…"
            className="input-base h-8 min-w-[180px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 text-[12px]"
          />
          <button className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--panel-strong)]">
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          <Link
            href={filterUrl({ category: "" })}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${!catFilter ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/50"}`}
          >
            All
          </Link>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={filterUrl({ category: catFilter === cat ? "" : cat })}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${catFilter === cat ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]/50"}`}
            >
              {CATEGORY_LABELS[cat]}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-strong)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
                <tr key={expense.id} className="border-t border-[var(--line)] align-middle hover:bg-[var(--panel-strong)]/40">
                  <td className="px-4 py-3">
                    <p className="mono text-[12px] font-bold text-[var(--ink)]">{expense.expenseNumber}</p>
                    <p className="text-[11px] text-[var(--ink-muted)]">{fmt(expense.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[var(--ink)]">{expense.description}</p>
                    {expense.reference && (
                      <p className="text-[11px] text-[var(--ink-muted)]">Ref: {expense.reference}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[expense.category]}`}>
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
                  <td className="hidden px-4 py-3 text-[11px] text-[var(--ink-muted)] sm:table-cell">
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
          <div className="border-t border-[var(--line)] px-4 py-2.5 text-right">
            <p className="text-[12px] font-bold text-[var(--ink)]">
              Total: {currency} {totalAmount.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
