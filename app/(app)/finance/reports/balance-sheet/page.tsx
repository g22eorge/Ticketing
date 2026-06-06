// @ts-nocheck — TODO: resolve underlying type issues and remove this pragma

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/session";

import { prisma } from "@/lib/prisma";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type AccountSummary = { code: string; name: string; balance: number };

function ratio(numerator: number, denominator: number, decimals = 2) {
  if (denominator === 0) return null;
  return (numerator / denominator).toFixed(decimals);
}

function AccountSection({
  title,
  items,
  total,
  currency,
  accentClass,
  badgeClass,
}: {
  title: string;
  items: AccountSummary[];
  total: number;
  currency: string;
  accentClass: string;
  badgeClass: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)]">
      <div className={`px-4 py-2.5 ${accentClass}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${badgeClass}`}>
            {formatMoneyCompact(total, currency)}
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--ink-muted)]">No activity</p>
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.code}
              className="flex items-center justify-between px-4 py-2.5 text-sm odd:bg-[var(--bg)] even:bg-[var(--panel)]/40"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-[var(--accent)]">{item.code}</span>
                <span className="text-[var(--ink)]">{item.name}</span>
              </div>
              <span className="tabular-nums font-medium text-[var(--ink)]">
                {formatMoney(item.balance, currency)}
              </span>
            </div>
          ))}
          <div className={`flex items-center justify-between border-t border-[var(--line)] px-4 py-2.5 font-bold ${accentClass}`}>
            <span className="text-sm">Total {title}</span>
            <span className="text-sm tabular-nums">{formatMoney(total, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default async function BalanceSheetPage({
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

  const asOf = new Date(year, month, 0, 23, 59, 59);

  const lines = await prisma.journalLine.findMany({
    where: { journalEntry: { status: "POSTED", date: { lte: asOf } } },
    include: { account: true },
  });

  function summarise(
    type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
  ): AccountSummary[] {
    const map = new Map<string, AccountSummary>();
    for (const l of lines) {
      if (l.account.type !== type) continue;
      const normalDebit = type === "ASSET" || type === "EXPENSE";
      const net = normalDebit ? l.debit - l.credit : l.credit - l.debit;
      const existing = map.get(l.accountId);
      if (existing) existing.balance += net;
      else map.set(l.accountId, { code: l.account.code, name: l.account.name, balance: net });
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  const assets = summarise("ASSET");
  const liabilities = summarise("LIABILITY");
  const equity = summarise("EQUITY");
  const revenues = summarise("REVENUE");
  const expenses = summarise("EXPENSE");

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity = equity.reduce((s, e) => s + e.balance, 0);
  const retainedEarnings =
    revenues.reduce((s, r) => s + r.balance, 0) -
    expenses.reduce((s, e) => s + e.balance, 0);
  const totalEquityAndRetained = totalEquity + retainedEarnings;
  const totalLiabEquity = totalLiabilities + totalEquityAndRetained;
  const balanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  // Financial ratios (using totals as proxy for current since we don't sub-classify)
  const workingCapital = totalAssets - totalLiabilities;
  const debtRatio = ratio(totalLiabilities, totalAssets);
  const _equityRatio = ratio(totalEquityAndRetained, totalAssets);
  const debtToEquity =
    totalEquityAndRetained !== 0
      ? ratio(totalLiabilities, Math.abs(totalEquityAndRetained))
      : null;

  const hasData = lines.length > 0;

  return (
    <div className="space-y-4">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="panel-shadow overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">Finance · Reports</p>
            <p className="text-[13px] font-bold text-[var(--ink)]">Balance Sheet</p>
            <p className="text-[13px] text-[var(--ink-muted)]">As of {MONTHS[month - 1]} {year}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/finance/reports/pl?year=${year}&month=${month}`}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--panel-strong)]"
            >
              ← P&amp;L
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
      <form method="GET" className="flex items-center gap-2">
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

      {!hasData ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center">
          <p className="text-sm text-[var(--ink-muted)]">
            No posted accounting entries up to this date.
          </p>
        </div>
      ) : (
        <>
          {/* ── BALANCE WARNING ──────────────────────────────────────────── */}
          {!balanced && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              Balance sheet does not balance — check accounting entries for missing or incorrect lines.
            </div>
          )}

          {/* ── FINANCIAL RATIOS STRIP ───────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Total Assets
              </p>
              <p className="mt-1 text-lg font-bold text-blue-600 tabular-nums">
                {formatMoneyCompact(totalAssets, currency)}
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Cumulative to date</p>
            </div>

            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Working Capital
              </p>
              <p
                className={`mt-1 text-lg font-bold tabular-nums ${
                  workingCapital >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {workingCapital < 0 ? "−" : ""}
                {formatMoneyCompact(Math.abs(workingCapital), currency)}
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Assets − Liabilities</p>
            </div>

            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Debt Ratio
              </p>
              <p
                className={`mt-1 text-lg font-bold tabular-nums ${
                  Number(debtRatio ?? 0) <= 0.5 ? "text-emerald-600" : "text-amber-500"
                }`}
              >
                {debtRatio !== null ? debtRatio : "—"}
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Liabilities / Assets</p>
            </div>

            <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
                Debt-to-Equity
              </p>
              <p
                className={`mt-1 text-lg font-bold tabular-nums ${
                  Number(debtToEquity ?? 0) <= 1 ? "text-emerald-600" : "text-amber-500"
                }`}
              >
                {debtToEquity !== null ? debtToEquity : "—"}
              </p>
              <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Liabilities / Equity</p>
            </div>
          </div>

          {/* ── MAIN LAYOUT: two columns on wide screens ─────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: Assets */}
            <AccountSection
              title="Assets"
              items={assets}
              total={totalAssets}
              currency={currency}
              accentClass="bg-blue-500/5 text-blue-800"
              badgeClass="bg-blue-500/15 text-blue-800"
            />

            {/* Right: Liabilities + Equity */}
            <div className="space-y-4">
              <AccountSection
                title="Liabilities"
                items={liabilities}
                total={totalLiabilities}
                currency={currency}
                accentClass="bg-red-500/5 text-red-800"
                badgeClass="bg-red-500/15 text-red-800"
              />

              {/* Equity (including retained earnings) */}
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <div className="bg-purple-500/5 px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-purple-800">
                      Equity
                    </p>
                    <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[13px] font-bold tabular-nums text-purple-800">
                      {formatMoneyCompact(totalEquityAndRetained, currency)}
                    </span>
                  </div>
                </div>
                {equity.map((e) => (
                  <div
                    key={e.code}
                    className="flex items-center justify-between px-4 py-2.5 text-sm odd:bg-[var(--bg)] even:bg-[var(--panel)]/40"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-[var(--accent)]">{e.code}</span>
                      <span className="text-[var(--ink)]">{e.name}</span>
                    </div>
                    <span className="tabular-nums font-medium">{formatMoney(e.balance, currency)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 text-sm odd:bg-[var(--bg)]">
                  <span className="italic text-[var(--ink-muted)]">Retained Earnings (net income)</span>
                  <span
                    className={`tabular-nums font-medium ${retainedEarnings >= 0 ? "text-emerald-600" : "text-red-500"}`}
                  >
                    {formatMoney(retainedEarnings, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line)] bg-purple-500/10 px-4 py-2.5 font-bold text-purple-800">
                  <span className="text-sm">Total Equity</span>
                  <span className="text-sm tabular-nums">{formatMoney(totalEquityAndRetained, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── EQUATION CHECK ───────────────────────────────────────────── */}
          <div
            className={`overflow-hidden rounded-xl border px-5 py-4 ${
              balanced
                ? "border-green-300/40 bg-green-500/10"
                : "border-red-300/40 bg-red-500/10"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-bold text-[var(--ink)]">
                  Accounting Equation: Assets = Liabilities + Equity
                </p>
                <p className="text-[13px] text-[var(--ink-muted)]">
                  {formatMoney(totalAssets, currency)} ={" "}
                  {formatMoney(totalLiabilities, currency)} +{" "}
                  {formatMoney(totalEquityAndRetained, currency)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                  balanced
                    ? "bg-green-500/20 text-green-700"
                    : "bg-red-500/20 text-red-700"
                }`}
              >
                {balanced ? "Balanced" : "Out of balance"}
              </span>
            </div>
          </div>

          {/* ── FINANCIAL RATIOS ─────────────────────────────────────────── */}
          <div>
            <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Financial Ratios</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {/* Current Ratio (using total assets / total liabilities as proxy) */}
              {(() => {
                const currentRatio = totalLiabilities !== 0 ? totalAssets / totalLiabilities : null;
                const color =
                  currentRatio === null ? "text-[var(--ink-muted)]"
                  : currentRatio >= 2 ? "text-emerald-600"
                  : currentRatio >= 1 ? "text-amber-600"
                  : "text-red-500";
                return (
                  <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Current Ratio</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>
                      {currentRatio !== null ? currentRatio.toFixed(2) : "—"}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">Assets / Liabilities (approx.)</p>
                  </div>
                );
              })()}
              {/* Debt-to-Equity */}
              {(() => {
                const dte =
                  totalEquityAndRetained !== 0
                    ? totalLiabilities / Math.abs(totalEquityAndRetained)
                    : null;
                const color =
                  dte === null ? "text-[var(--ink-muted)]"
                  : dte < 1 ? "text-emerald-600"
                  : dte < 2 ? "text-amber-600"
                  : "text-red-500";
                return (
                  <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Debt-to-Equity</p>
                    <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>
                      {dte !== null ? dte.toFixed(2) : "—"}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">Liabilities / Equity</p>
                  </div>
                );
              })()}
              {/* Working Capital */}
              <div className="panel-shadow rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
                <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Working Capital</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${workingCapital >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {workingCapital < 0 ? "−" : ""}{formatMoneyCompact(Math.abs(workingCapital), currency)}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">Assets − Liabilities (approx.)</p>
              </div>
            </div>
          </div>

          {/* ── QUICK LINKS ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "P&L Statement", href: `/finance/reports/pl?year=${year}&month=${month}` },
              { label: "Chart of Accounts", href: "/finance/accounts" },
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
