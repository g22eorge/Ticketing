// @ts-nocheck
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

import { orgDb, prisma } from "@/lib/prisma";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TYPE_COLOR: Record<string, string> = {
  ASSET:     "bg-blue-500/10 text-blue-600",
  LIABILITY: "bg-red-500/10 text-red-600",
  EQUITY:    "bg-purple-500/10 text-purple-600",
  REVENUE:   "bg-green-500/10 text-green-600",
  EXPENSE:   "bg-amber-500/10 text-amber-700",
};

export default async function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { user } = await getCurrentUserRole();
  const db = orgDb(user.orgId);
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;

  const now = new Date();
  const year  = parseInt(sp.year  ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? "0"); // 0 = all time

  const account = await db.chartOfAccount.findFirst({
    where: { id },
    include: { parent: { select: { code: true, name: true } } },
  });
  if (!account) notFound();

  // Date filter
  const dateFilter =
    month > 0
      ? { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0, 23, 59, 59) }
      : year !== now.getFullYear()
        ? { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) }
        : undefined;

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: id,
      journalEntry: {
        status: "POSTED",
        ...(dateFilter ? { date: dateFilter } : {}),
      },
    },
    include: {
      journalEntry: {
        select: {
          entryNumber: true,
          date: true,
          description: true,
          reference: true,
        },
      },
    },
    orderBy: { journalEntry: { date: "asc" } },
  });

  // Also fetch all-time lines for running balance from beginning
  const allLines = await prisma.journalLine.findMany({
    where: {
      accountId: id,
      journalEntry: { status: "POSTED" },
    },
    include: { journalEntry: { select: { date: true } } },
    orderBy: { journalEntry: { date: "asc" } },
  });

  const currency = "UGX";
  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";

  // Running balance from start up to filter start (opening balance for period)
  let openingBalance = 0;
  if (dateFilter?.gte) {
    for (const l of allLines) {
      if (l.journalEntry.date < dateFilter.gte) {
        openingBalance += isDebitNormal ? l.debit - l.credit : l.credit - l.debit;
      }
    }
  }

  // Build rows with running balance
  const rows = lines.reduce<Array<(typeof lines)[number] & { net: number; runningBalance: number }>>((acc, l) => {
    const previous = acc.at(-1)?.runningBalance ?? openingBalance;
    const net = isDebitNormal ? l.debit - l.credit : l.credit - l.debit;
    acc.push({
      ...l,
      net,
      runningBalance: previous + net,
    });
    return acc;
  }, []);

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const closingBalance = openingBalance + rows.reduce((s, r) => s + r.net, 0);

  // All-time balance
  const allTimeBalance = allLines.reduce(
    (s, l) => s + (isDebitNormal ? l.debit - l.credit : l.credit - l.debit),
    0,
  );

  // Period label
  const periodLabel =
    month > 0
      ? `${MONTHS[month - 1]} ${year}`
      : year !== now.getFullYear()
        ? `Year ${year}`
        : "All Time";

  const availableYears = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <div className="space-y-5 p-4 lg:p-6">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance · Accounts</p>
          <p className="mt-0.5 text-[13px] font-bold text-[var(--ink)]">
            <span className="font-mono text-[var(--accent)]">{account.code}</span>
            {" "}
            {account.name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${TYPE_COLOR[account.type] ?? ""}`}>
              {account.type}
            </span>
            {account.parent && (
              <span className="text-[13px] text-[var(--ink-muted)]">
                under {account.parent.code} {account.parent.name}
              </span>
            )}
            {account.description && (
              <span className="text-[13px] text-[var(--ink-muted)]">· {account.description}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/finance/reports/pl"
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-[var(--panel)]"
          >
            P&L →
          </Link>
        </div>
      </div>

      {/* ── PERIOD SELECTOR ──────────────────────────────────────────────── */}
      <form method="GET" className="hidden lg:flex flex-wrap items-center gap-2">
        <select
          name="month"
          defaultValue={month}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <option value="0">All months</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          name="year"
          defaultValue={year}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          Filter
        </button>
        {(month > 0 || year !== now.getFullYear()) && (
          <Link
            href={`/finance/accounts/${id}`}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--panel)]"
          >
            Clear
          </Link>
        )}
      </form>

      {/* ── KPI TILES ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            All-Time Balance
          </p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${allTimeBalance >= 0 ? "text-[var(--ink)]" : "text-red-500"}`}>
            {allTimeBalance < 0 ? "−" : ""}
            {formatMoneyCompact(Math.abs(allTimeBalance), currency)}
          </p>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">{allLines.length} postings</p>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            {periodLabel} — Debits
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(totalDebit, currency)}
          </p>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
            {periodLabel} — Credits
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[var(--ink)]">
            {formatMoneyCompact(totalCredit, currency)}
          </p>
        </div>

        <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Closing Balance</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${closingBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {closingBalance < 0 ? "−" : ""}
            {formatMoneyCompact(Math.abs(closingBalance), currency)}
          </p>
          <p className="mt-1 text-[13px] text-[var(--ink-muted)]">{lines.length} transactions</p>
        </div>
      </div>

      {/* ── LEDGER TABLE ─────────────────────────────────────────────────── */}
      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center">
          <p className="text-sm text-[var(--ink-muted)]">No posted transactions for this period.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--panel-strong)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Date</th>
                <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Entry</th>
                <th className="px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Description</th>
                <th className="hidden px-4 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)] md:table-cell">Memo</th>
                <th className="px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Debit</th>
                <th className="px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Credit</th>
                <th className="px-4 py-2.5 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-[var(--bg)]">
              {/* Opening balance row */}
              {openingBalance !== 0 && (
                <tr className="bg-[var(--panel-strong)]/50">
                  <td className="px-4 py-2 text-[13px] text-[var(--ink-muted)]">—</td>
                  <td className="px-4 py-2 text-[13px] italic text-[var(--ink-muted)]" colSpan={4}>
                    Opening balance
                  </td>
                  <td className="px-4 py-2 text-right text-[13px] font-semibold tabular-nums text-[var(--ink-muted)]" colSpan={2}>
                    {formatMoney(openingBalance, currency)}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--panel)]">
                  <td className="px-4 py-2.5 text-[12px] text-[var(--ink-muted)]">
                    {new Date(row.journalEntry.date).toLocaleDateString("en-UG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[13px] font-semibold text-[var(--accent)]">
                      {row.journalEntry.entryNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-[var(--ink)]">
                    {row.journalEntry.description}
                    {row.journalEntry.reference && (
                      <span className="ml-1.5 text-[13px] text-[var(--ink-muted)]">
                        · {row.journalEntry.reference}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-[12px] text-[var(--ink-muted)] md:table-cell">
                    {row.description || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.debit > 0 ? (
                      <span className="font-medium text-[var(--ink)]">
                        {formatMoney(row.debit, currency)}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.credit > 0 ? (
                      <span className="text-[var(--ink-muted)]">
                        {formatMoney(row.credit, currency)}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right text-[12px] font-semibold tabular-nums ${
                      row.runningBalance >= 0 ? "text-[var(--ink)]" : "text-red-600"
                    }`}
                  >
                    {row.runningBalance < 0 ? "−" : ""}
                    {formatMoney(Math.abs(row.runningBalance), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--line)] bg-[var(--panel-strong)]">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-bold text-[var(--ink)]">Totals</td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-[var(--ink)]">
                  {formatMoney(totalDebit, currency)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-[var(--ink-muted)]">
                  {formatMoney(totalCredit, currency)}
                </td>
                <td
                  className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${
                    closingBalance >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {closingBalance < 0 ? "−" : ""}
                  {formatMoney(Math.abs(closingBalance), currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
