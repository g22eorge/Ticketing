// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountType } from "@prisma/client";
import { getCurrentUserRole } from "@/lib/session";

import { orgDb, prisma } from "@/lib/prisma";
import { formatMoneyCompact } from "@/lib/currency";
import { ConfirmSubmitButton } from "@/components/shared/ConfirmSubmitButton";
import { RowActionsMenu, MenuSection, MenuDestructiveRow } from "@/components/shared/RowActionsMenu";
import { can } from "@/lib/permissions";

const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

const TYPE_COLOR: Record<AccountType, string> = {
  ASSET:     "bg-blue-500/10 text-blue-600",
  LIABILITY: "bg-red-500/10 text-red-600",
  EQUITY:    "bg-purple-500/10 text-purple-600",
  REVENUE:   "bg-green-500/10 text-green-600",
  EXPENSE:   "bg-amber-500/10 text-amber-700",
};

const TYPE_HEADER: Record<AccountType, string> = {
  ASSET:     "bg-blue-500/5 text-blue-800",
  LIABILITY: "bg-red-500/5 text-red-800",
  EQUITY:    "bg-purple-500/5 text-purple-800",
  REVENUE:   "bg-green-500/5 text-green-800",
  EXPENSE:   "bg-amber-500/5 text-amber-800",
};

export const dynamic = "force-dynamic";

export default async function ChartOfAccountsPage() {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.viewFinancials(user)) redirect("/dashboard");

  async function createAccount(fd: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    const code = fd.get("code") as string;
    const name = fd.get("name") as string;
    const type = fd.get("type") as AccountType;
    const parentId = (fd.get("parentId") as string) || null;
    const description = (fd.get("description") as string) || null;
    if (!code || !name || !type) return;
    await db.chartOfAccount.create({
      data: { code: code.trim(), name: name.trim(), type, parentId, description },
    });
    revalidatePath("/finance/accounts");
  }

  async function toggleActive(fd: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    const id = fd.get("id") as string;
    const acc = await db.chartOfAccount.findFirst({ where: { id } });
    if (!acc || acc.isSystem) return;
    await db.chartOfAccount.update({ where: { id }, data: { isActive: !acc.isActive } });
    revalidatePath("/finance/accounts");
  }

  async function deleteAccount(fd: FormData) {
    "use server";
    const { user: _u } = await getCurrentUserRole();
    const db = orgDb(user.orgId);
    const id = fd.get("id") as string;
    const acc = await db.chartOfAccount.findFirst({ where: { id } });
    if (!acc || acc.isSystem) return;
    const hasLines = await prisma.journalLine.findFirst({ where: { accountId: id } });
    if (hasLines) return;
    await db.chartOfAccount.delete({ where: { id } });
    revalidatePath("/finance/accounts");
  }

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [accounts, allTimeLines, thisMonthLines] = await Promise.all([
    db.chartOfAccount.findMany({
      where: {},
      orderBy: [{ type: "asc" }, { code: "asc" }],
      include: { parent: { select: { code: true, name: true } } },
    }),
    // All posted lines for running balance
    prisma.journalLine.findMany({
      where: { journalEntry: { status: "POSTED" } },
      select: { accountId: true, debit: true, credit: true },
    }),
    // This month's lines for activity
    prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: "POSTED",
          date: { gte: thisMonthStart, lte: thisMonthEnd },
        },
      },
      select: { accountId: true, debit: true, credit: true },
    }),
  ]);

  // Aggregate balance per account (all time)
  const balanceMap = new Map<string, number>();
  for (const l of allTimeLines) {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "ASSET" || acc.type === "EXPENSE";
    const net = isDebitNormal ? l.debit - l.credit : l.credit - l.debit;
    balanceMap.set(l.accountId, (balanceMap.get(l.accountId) ?? 0) + net);
  }

  // Aggregate this month's net activity per account
  const monthlyMap = new Map<string, number>();
  for (const l of thisMonthLines) {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "ASSET" || acc.type === "EXPENSE";
    const net = isDebitNormal ? l.debit - l.credit : l.credit - l.debit;
    monthlyMap.set(l.accountId, (monthlyMap.get(l.accountId) ?? 0) + net);
  }

  const currency = "UGX";

  const byType = ACCOUNT_TYPES.map((t) => ({
    type: t,
    items: accounts.filter((a) => a.type === t),
    totalBalance: accounts
      .filter((a) => a.type === t)
      .reduce((s, a) => s + (balanceMap.get(a.id) ?? 0), 0),
  }));

  const totals: Record<AccountType, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0, REVENUE: 0, EXPENSE: 0 };
  for (const t of ACCOUNT_TYPES) totals[t] = accounts.filter((a) => a.type === t).length;

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[13px] font-bold text-[var(--ink)]">Chart of Accounts</p>
            <p className="text-[11px] text-[var(--ink-muted)]">Double-entry accounting structure — click any account to view its ledger</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/finance/reports/pl"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel-strong)]"
            >
              P&amp;L →
            </Link>
          </div>
        </div>
      </div>

      {/* ── ACCOUNT TYPE KPI STRIP ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            { type: "ASSET" as AccountType, label: "Total Assets", colorVal: "text-blue-600", borderClass: "border-blue-500/20" },
            { type: "LIABILITY" as AccountType, label: "Total Liabilities", colorVal: "text-red-600", borderClass: "border-red-500/20" },
            { type: "EQUITY" as AccountType, label: "Total Equity", colorVal: "text-purple-600", borderClass: "border-purple-500/20" },
            { type: "REVENUE" as AccountType, label: "Total Revenue", colorVal: "text-green-600", borderClass: "border-green-500/20" },
            { type: "EXPENSE" as AccountType, label: "Total Expenses", colorVal: "text-amber-700", borderClass: "border-amber-500/20" },
          ] as const
        ).map(({ type, label, colorVal, borderClass }) => {
          const bal = byType.find((b) => b.type === type)!.totalBalance;
          return (
            <div key={type} className={`panel-shadow rounded-xl border bg-[var(--panel)] px-4 py-3 ${borderClass}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${colorVal}`}>
                {bal !== 0 ? formatMoneyCompact(Math.abs(bal), currency) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                {totals[type]} account{totals[type] !== 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── CREATE FORM ──────────────────────────────────────────────────── */}
      <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[var(--ink)]">
          + Add Account
        </summary>
        <form
          action={createAccount}
          className="grid grid-cols-2 gap-4 border-t border-[var(--line)] p-5 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Code *</label>
            <input
              name="code"
              required
              placeholder="e.g. 1000"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Name *</label>
            <input
              name="name"
              required
              placeholder="Cash & Bank"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Type *</label>
            <select
              name="type"
              required
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Parent account</label>
            <select
              name="parentId"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            >
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Description</label>
            <input
              name="description"
              placeholder="Optional"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end sm:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Create Account
            </button>
          </div>
        </form>
      </details>

      {/* ── ACCOUNTS BY TYPE ─────────────────────────────────────────────── */}
      {byType.map(({ type, items, totalBalance }) => (
        <div key={type}>
          <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-2 ${TYPE_HEADER[type]}`}>
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_COLOR[type]}`}>
                {type}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                {items.length} account{items.length !== 1 ? "s" : ""}
              </span>
            </div>
            {totalBalance !== 0 && (
              <span className="text-sm font-bold tabular-nums">
                {formatMoneyCompact(Math.abs(totalBalance), currency)}
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--ink-muted)]">
              No {type.toLowerCase()} accounts yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--panel)]">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Code</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Name</th>
                    <th className="hidden px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)] md:table-cell">Parent</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--ink-muted)]">Balance</th>
                    <th className="hidden px-4 py-2.5 text-right text-xs font-semibold text-[var(--ink-muted)] lg:table-cell">This Month</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--ink-muted)]">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
                  {items.map((acc) => {
                    const balance = balanceMap.get(acc.id) ?? 0;
                    const monthly = monthlyMap.get(acc.id) ?? 0;
                    const hasActivity = balance !== 0 || monthly !== 0;
                    return (
                      <tr key={acc.id} className="hover:bg-[var(--panel)]">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                            {acc.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {hasActivity ? (
                            <Link
                              href={`/finance/accounts/${acc.id}`}
                              className="font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                            >
                              {acc.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-[var(--ink)]">{acc.name}</span>
                          )}
                          {acc.description && (
                            <p className="text-[11px] text-[var(--ink-muted)]">{acc.description}</p>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-[var(--ink-muted)] md:table-cell">
                          {acc.parent ? `${acc.parent.code} ${acc.parent.name}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {balance !== 0 ? (
                            <Link
                              href={`/finance/accounts/${acc.id}`}
                              className={`font-semibold tabular-nums hover:underline ${balance >= 0 ? "text-[var(--ink)]" : "text-red-600"}`}
                            >
                              {balance < 0 ? "−" : ""}
                              {formatMoneyCompact(Math.abs(balance), currency)}
                            </Link>
                          ) : (
                            <span className="text-[var(--ink-muted)]">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-right lg:table-cell">
                          {monthly !== 0 ? (
                            <span
                              className={`text-[11px] font-semibold tabular-nums ${monthly >= 0 ? "text-emerald-600" : "text-red-500"}`}
                            >
                              {monthly >= 0 ? "+" : "−"}
                              {formatMoneyCompact(Math.abs(monthly), currency)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--ink-muted)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {acc.isSystem ? (
                            <span className="text-xs text-[var(--ink-muted)]">System</span>
                          ) : acc.isActive ? (
                            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-700">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasActivity && (
                              <Link
                                href={`/finance/accounts/${acc.id}`}
                                className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-medium text-[var(--ink-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                              >
                                Ledger →
                              </Link>
                            )}
                            {!acc.isSystem && (
                              <RowActionsMenu label="Account actions">
                                <MenuSection label="Actions" />
                                <form action={toggleActive}>
                                  <input type="hidden" name="id" value={acc.id} />
                                  <button
                                    type="submit"
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel)]"
                                  >
                                    {acc.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </form>
                                <MenuDestructiveRow>
                                  <form action={deleteAccount}>
                                    <input type="hidden" name="id" value={acc.id} />
                                    <ConfirmSubmitButton
                                      message="Delete this account? Cannot be undone if it has no transactions."
                                      className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </ConfirmSubmitButton>
                                  </form>
                                </MenuDestructiveRow>
                              </RowActionsMenu>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
