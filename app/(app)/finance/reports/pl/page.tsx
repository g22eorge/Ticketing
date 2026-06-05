import Link from "next/link";
// @ts-nocheck
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

import { prisma } from "@/lib/prisma";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { can } from "@/lib/permissions";
import { PLTrendChart } from "@/components/reports/FinanceCharts";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pctOfRevenue(amount: number, revenue: number) {
  if (revenue <= 0) return null;
  return ((amount / revenue) * 100).toFixed(1);
}

function changePct(current: number, prior: number) {
  if (prior === 0) return current > 0 ? "+∞" : null;
  const p = ((current - prior) / Math.abs(prior)) * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
}

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { user } = await getCurrentUserRole();
  if (!can.viewFinancials(user)) redirect("/dashboard");

  const sp = await searchParams;
  const currency = "UGX";
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));
  const mode = sp.mode === "ytd" ? "ytd" : "month";

  // Current period
  const from = mode === "ytd" ? new Date(year, 0, 1) : new Date(year, month - 1, 1);
  const to = mode === "ytd"
    ? new Date(year, month, 0, 23, 59, 59)
    : new Date(year, month, 0, 23, 59, 59);

  // Prior period (same length, shifted back by one period)
  const priorFrom = mode === "ytd"
    ? new Date(year - 1, 0, 1)
    : new Date(year, month - 2, 1);
  const priorTo = mode === "ytd"
    ? new Date(year - 1, month, 0, 23, 59, 59)
    : new Date(year, month - 1, 0, 23, 59, 59);

  // 6-month trend window (ending at selected month)
  const trendWindowStart = new Date(year, month - 7, 1);
  const trendWindowEnd = new Date(year, month, 0, 23, 59, 59);

  const [lines, priorLines, trendLines] = await Promise.all([
    prisma.journalLine.findMany({
      where: { journalEntry: { status: "POSTED", date: { gte: from, lte: to } } },
      include: { account: true, journalEntry: { select: { date: true } } },
    }),
    prisma.journalLine.findMany({
      where: { journalEntry: { status: "POSTED", date: { gte: priorFrom, lte: priorTo } } },
      include: { account: true },
    }),
    prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: "POSTED",
          date: { gte: trendWindowStart, lte: trendWindowEnd },
        },
      },
      include: { account: true, journalEntry: { select: { date: true } } },
    }),
  ]);

  type AccountRow = {
    code: string;
    name: string;
    amount: number;
    priorAmount: number;
  };

  function buildRows(type: "REVENUE" | "EXPENSE"): AccountRow[] {
    const map = new Map<string, AccountRow>();

    for (const l of lines) {
      if (l.account.type !== type) continue;
      const net = type === "REVENUE" ? l.credit - l.debit : l.debit - l.credit;
      const row = map.get(l.accountId);
      if (row) row.amount += net;
      else map.set(l.accountId, { code: l.account.code, name: l.account.name, amount: net, priorAmount: 0 });
    }
    for (const l of priorLines) {
      if (l.account.type !== type) continue;
      const net = type === "REVENUE" ? l.credit - l.debit : l.debit - l.credit;
      const row = map.get(l.accountId);
      if (row) row.priorAmount += net;
      else map.set(l.accountId, { code: l.account.code, name: l.account.name, amount: 0, priorAmount: net });
    }

    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  const revenues = buildRows("REVENUE");
  const expenses = buildRows("EXPENSE");

  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const netIncome = totalRevenue - totalExpense;
  const priorRevenue = revenues.reduce((s, r) => s + r.priorAmount, 0);
  const priorExpense = expenses.reduce((s, e) => s + e.priorAmount, 0);
  const priorNetIncome = priorRevenue - priorExpense;
  const netMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;
  const priorNetMargin = priorRevenue > 0 ? (priorNetIncome / priorRevenue) * 100 : 0;

  // Build 6-month trend data
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 1 - (5 - i), 1);
    return {
      key: `${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== year ? " '" + String(d.getFullYear()).slice(2) : ""}`,
      yr: d.getFullYear(),
      mo: d.getMonth(),
    };
  });

  const trendMap = new Map(trendMonths.map((m) => [m.key, { key: m.key, revenue: 0, expenses: 0, net: 0 }]));

  for (const l of trendLines) {
    if (!l.journalEntry) continue;
    const d = l.journalEntry.date;
    const entry = trendMonths.find((m) => m.yr === d.getFullYear() && m.mo === d.getMonth());
    if (!entry) continue;
    const bucket = trendMap.get(entry.key);
    if (!bucket) continue;
    if (l.account.type === "REVENUE") bucket.revenue += l.credit - l.debit;
    if (l.account.type === "EXPENSE") bucket.expenses += l.debit - l.credit;
    bucket.net = bucket.revenue - bucket.expenses;
  }
  const trendData = [...trendMap.values()];

  const hasData = lines.length > 0;
  const hasTrend = trendLines.length > 0;

  const periodLabel = mode === "ytd"
    ? `Jan–${MONTHS[month - 1]} ${year} YTD`
    : `${MONTHS[month - 1]} ${year}`;
  const priorLabel = mode === "ytd"
    ? `Jan–${MONTHS[month - 1]} ${year - 1}`
    : month === 1
      ? `${MONTHS[11]} ${year - 1}`
      : `${MONTHS[month - 2]} ${year}`;

  return (
    <div className="space-y-5 p-4 lg:p-6">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Profit &amp; Loss</p>
            <p className="text-[13px] text-[var(--ink-muted)]">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/finance/reports/balance-sheet?year=${year}&month=${month}`}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--panel-strong)]"
            >
              Balance Sheet →
            </Link>
            <Link
              href="/finance/accounts"
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--panel-strong)]"
            >
              Chart of Accounts
            </Link>
          </div>
        </div>
      </div>

      {/* ── PERIOD SELECTOR ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" className="flex items-center gap-2">
          <input type="hidden" name="mode" value={mode} />
          <select
            name="month"
            defaultValue={month}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            name="year"
            defaultValue={year}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
          >
            {[year - 2, year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            View
          </button>
        </form>

        {/* Monthly / YTD toggle */}
        <div className="flex rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-0.5">
          <Link
            href={`/finance/reports/pl?year=${year}&month=${month}&mode=month`}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "month"
                ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            Monthly
          </Link>
          <Link
            href={`/finance/reports/pl?year=${year}&month=${month}&mode=ytd`}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "ytd"
                ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            YTD
          </Link>
        </div>
      </div>

      {/* ── KPI TILES ────────────────────────────────────────────────────── */}
      {hasData && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Revenue */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Revenue</p>
            <p className="mt-1 text-lg font-bold text-emerald-600 tabular-nums">
              {formatMoneyCompact(totalRevenue, currency)}
            </p>
            {priorRevenue > 0 && (
              <p
                className={`mt-1 text-[13px] font-semibold ${
                  totalRevenue >= priorRevenue ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {changePct(totalRevenue, priorRevenue)} vs {priorLabel}
              </p>
            )}
          </div>

          {/* Expenses */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Expenses</p>
            <p className="mt-1 text-lg font-bold text-red-500 tabular-nums">
              {formatMoneyCompact(totalExpense, currency)}
            </p>
            {priorExpense > 0 && (
              <p
                className={`mt-1 text-[13px] font-semibold ${
                  totalExpense <= priorExpense ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {changePct(totalExpense, priorExpense)} vs {priorLabel}
              </p>
            )}
          </div>

          {/* Net Income */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
              Net {netIncome >= 0 ? "Income" : "Loss"}
            </p>
            <p
              className={`mt-1 text-lg font-bold tabular-nums ${
                netIncome >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {formatMoneyCompact(Math.abs(netIncome), currency)}
            </p>
            {priorNetIncome !== 0 && (
              <p
                className={`mt-1 text-[13px] font-semibold ${
                  netIncome >= priorNetIncome ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {changePct(netIncome, priorNetIncome)} vs prior
              </p>
            )}
          </div>

          {/* Net Margin */}
          <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Net Margin</p>
            <p
              className={`mt-1 text-lg font-bold tabular-nums ${
                netMargin >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {netMargin.toFixed(1)}%
            </p>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
              Prior: {priorRevenue > 0 ? priorNetMargin.toFixed(1) + "%" : "—"}
            </p>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ──────────────────────────────────────────────────── */}
      {!hasData ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center space-y-2">
          <p className="text-sm font-medium text-[var(--ink-muted)]">
            No posted accounting entries for this period.
          </p>
        </div>
      ) : (
        <>
          {/* ── P&L TABLE ──────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 border-b border-[var(--line)] bg-[var(--panel-strong)] px-5 py-2.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Account</span>
              <span className="w-28 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                {periodLabel}
              </span>
              <span className="w-28 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                {priorLabel}
              </span>
              <span className="w-16 text-right text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Change
              </span>
            </div>

            {/* Revenue */}
            <div className="border-b border-[var(--line)]">
              <div className="bg-green-500/5 px-5 py-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">Revenue</p>
              </div>
              {revenues.length === 0 ? (
                <p className="px-5 py-3 text-sm text-[var(--ink-muted)]">No revenue accounts with activity</p>
              ) : (
                revenues.map((r) => (
                  <div
                    key={r.code}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-[var(--accent)]">{r.code}</span>
                      <span className="text-sm text-[var(--ink)]">{r.name}</span>
                    </div>
                    <span className="w-28 text-right text-sm font-medium tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </span>
                    <span className="w-28 text-right text-sm tabular-nums text-[var(--ink-muted)]">
                      {formatMoney(r.priorAmount, currency)}
                    </span>
                    <span
                      className={`w-16 text-right text-[13px] font-semibold tabular-nums ${
                        r.amount >= r.priorAmount ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {changePct(r.amount, r.priorAmount) ?? "—"}
                    </span>
                  </div>
                ))
              )}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center bg-green-500/10 px-5 py-3">
                <span className="text-sm font-bold text-green-800">Total Revenue</span>
                <span className="w-28 text-right text-sm font-bold tabular-nums text-green-800">
                  {formatMoney(totalRevenue, currency)}
                </span>
                <span className="w-28 text-right text-sm font-semibold tabular-nums text-green-700/70">
                  {formatMoney(priorRevenue, currency)}
                </span>
                <span
                  className={`w-16 text-right text-[13px] font-semibold tabular-nums ${
                    totalRevenue >= priorRevenue ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {changePct(totalRevenue, priorRevenue) ?? "—"}
                </span>
              </div>
            </div>

            {/* Expenses */}
            <div className="border-b border-[var(--line)]">
              <div className="bg-red-500/5 px-5 py-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">Expenses</p>
              </div>
              {expenses.length === 0 ? (
                <p className="px-5 py-3 text-sm text-[var(--ink-muted)]">No expense accounts with activity</p>
              ) : (
                expenses.map((e) => {
                  const pct = pctOfRevenue(e.amount, totalRevenue);
                  return (
                    <div
                      key={e.code}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-[var(--accent)]">{e.code}</span>
                        <span className="text-sm text-[var(--ink)]">{e.name}</span>
                        {pct !== null && (
                          <span className="rounded-full bg-[var(--panel-strong)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--ink-muted)]">
                            {pct}%
                          </span>
                        )}
                      </div>
                      <span className="w-28 text-right text-sm font-medium tabular-nums">
                        {formatMoney(e.amount, currency)}
                      </span>
                      <span className="w-28 text-right text-sm tabular-nums text-[var(--ink-muted)]">
                        {formatMoney(e.priorAmount, currency)}
                      </span>
                      <span
                        className={`w-16 text-right text-[13px] font-semibold tabular-nums ${
                          e.amount <= e.priorAmount ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {changePct(e.amount, e.priorAmount) ?? "—"}
                      </span>
                    </div>
                  );
                })
              )}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center bg-red-500/10 px-5 py-3">
                <span className="text-sm font-bold text-red-800">Total Expenses</span>
                <span className="w-28 text-right text-sm font-bold tabular-nums text-red-800">
                  {formatMoney(totalExpense, currency)}
                </span>
                <span className="w-28 text-right text-sm font-semibold tabular-nums text-red-700/70">
                  {formatMoney(priorExpense, currency)}
                </span>
                <span
                  className={`w-16 text-right text-[13px] font-semibold tabular-nums ${
                    totalExpense <= priorExpense ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {changePct(totalExpense, priorExpense) ?? "—"}
                </span>
              </div>
            </div>

            {/* Net Income */}
            <div
              className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-4 ${
                netIncome >= 0 ? "bg-green-500/15" : "bg-red-500/15"
              }`}
            >
              <div>
                <span className="text-base font-bold text-[var(--ink)]">
                  Net {netIncome >= 0 ? "Income" : "Loss"}
                </span>
                {totalRevenue > 0 && (
                  <span
                    className={`ml-2 text-[13px] font-semibold ${
                      netMargin >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    ({netMargin.toFixed(1)}% margin)
                  </span>
                )}
              </div>
              <span
                className={`w-28 text-right text-lg font-bold tabular-nums ${
                  netIncome >= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {formatMoney(Math.abs(netIncome), currency)}
              </span>
              <span
                className={`w-28 text-right text-sm font-semibold tabular-nums ${
                  priorNetIncome >= 0 ? "text-green-700/60" : "text-red-700/60"
                }`}
              >
                {formatMoney(Math.abs(priorNetIncome), currency)}
              </span>
              <span
                className={`w-16 text-right text-[13px] font-semibold tabular-nums ${
                  netIncome >= priorNetIncome ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {changePct(netIncome, priorNetIncome) ?? "—"}
              </span>
            </div>
          </div>

          {/* ── 6-MONTH TREND ────────────────────────────────────────────────── */}
          {hasTrend && (
            <section className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                  6-Month Trend
                </p>
                <p className="text-[13px] text-[var(--ink-muted)]">Revenue · Expenses · Net</p>
              </div>
              <PLTrendChart data={trendData} currency={currency} />
              <div className="mt-4 doc-list overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="px-3 py-2 text-left text-[13px] font-semibold text-[var(--ink-muted)]">Month</th>
                      <th className="px-3 py-2 text-right text-[13px] font-semibold text-[var(--ink-muted)]">Revenue</th>
                      <th className="px-3 py-2 text-right text-[13px] font-semibold text-[var(--ink-muted)]">Expenses</th>
                      <th className="px-3 py-2 text-right text-[13px] font-semibold text-[var(--ink-muted)]">Net</th>
                      <th className="px-3 py-2 text-right text-[13px] font-semibold text-[var(--ink-muted)]">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendData.map((row) => (
                      <tr key={row.key} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-3 py-2.5 text-sm font-medium text-[var(--ink)]">{row.key}</td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-emerald-600">
                          {formatMoneyCompact(row.revenue, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-[var(--ink-muted)]">
                          {formatMoneyCompact(row.expenses, currency)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right text-sm font-semibold tabular-nums ${
                            row.net >= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {row.net < 0 ? "−" : ""}
                          {formatMoneyCompact(Math.abs(row.net), currency)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${
                            row.revenue > 0 && row.net / row.revenue >= 0
                              ? "text-emerald-600"
                              : "text-red-500"
                          }`}
                        >
                          {row.revenue > 0 ? ((row.net / row.revenue) * 100).toFixed(1) + "%" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── QUICK LINKS ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Balance Sheet", href: `/finance/reports/balance-sheet?year=${year}&month=${month}` },
              { label: "Expenses", href: "/finance/expenses" },
              { label: "Bank Accounts", href: "/finance/bank" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-center text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--ink)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
