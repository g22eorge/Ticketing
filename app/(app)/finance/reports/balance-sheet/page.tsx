import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/org-context";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { user, orgId, org } = await requireOrgSession();
  if (!["ADMIN", "MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const currency = org.baseCurrency ?? "UGX";
  const now  = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  // As-of date = last day of selected month
  const asOf = new Date(year, month, 0, 23, 59, 59);

  // All posted journal lines up to asOf
  const lines = await prisma.journalLine.findMany({
    where: { journalEntry: { orgId, status: "POSTED", date: { lte: asOf } } },
    include: { account: true },
  });

  type AccountSummary = { code: string; name: string; balance: number };

  function summarise(type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"): AccountSummary[] {
    const map = new Map<string, AccountSummary>();
    for (const l of lines) {
      if (l.account.type !== type) continue;
      const existing = map.get(l.accountId);
      // Normal balance: ASSET/EXPENSE = debit; LIABILITY/EQUITY/REVENUE = credit
      const normalDebit = type === "ASSET" || type === "EXPENSE";
      const net = normalDebit ? l.debit - l.credit : l.credit - l.debit;
      if (existing) existing.balance += net;
      else map.set(l.accountId, { code: l.account.code, name: l.account.name, balance: net });
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  const assets      = summarise("ASSET");
  const liabilities = summarise("LIABILITY");
  const equity      = summarise("EQUITY");
  const revenues    = summarise("REVENUE");
  const expenses    = summarise("EXPENSE");

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
  const totalEquity      = equity.reduce((s, e) => s + e.balance, 0);
  const retainedEarnings = revenues.reduce((s, r) => s + r.balance, 0) - expenses.reduce((s, e) => s + e.balance, 0);
  const totalEquityAndRetained = totalEquity + retainedEarnings;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquityAndRetained)) < 0.01;

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function Section({ title, items, total, color }: { title: string; items: AccountSummary[]; total: number; color: string }) {
    return (
      <div className="border-b border-[var(--line)]">
        <div className={`px-5 py-2.5 ${color}`}>
          <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-3 text-sm text-[var(--ink-muted)]">No activity</p>
        ) : (
          items.map((item) => (
            <div key={item.code} className="flex items-center justify-between px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40">
              <div>
                <span className="font-mono text-xs text-[var(--accent)] mr-2">{item.code}</span>
                <span className="text-sm text-[var(--ink)]">{item.name}</span>
              </div>
              <span className="text-sm font-medium tabular-nums">{formatMoney(item.balance, currency)}</span>
            </div>
          ))
        )}
        <div className={`flex items-center justify-between px-5 py-3 font-bold border-t border-[var(--line)] ${color}`}>
          <span className="text-sm">Total {title}</span>
          <span className="text-sm tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">Balance Sheet</h1>
          <p className="text-sm text-[var(--ink-muted)]">As of {months[month - 1]} {year}</p>
        </div>
        <Link href={`/finance/reports/pl?year=${year}&month=${month}`}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--panel)]">
          ← P&L
        </Link>
      </div>

      {/* Period selector */}
      <form method="GET" className="flex items-center gap-3">
        <select name="month" defaultValue={month} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="year" defaultValue={year} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black">View</button>
      </form>

      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] py-14 text-center">
          <p className="text-sm text-[var(--ink-muted)]">No posted journal entries up to this date.</p>
        </div>
      ) : (
        <>
          {!balanced && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              ⚠ Balance sheet does not balance — check your journal entries for missing lines.
            </div>
          )}

          <div className="rounded-xl border border-[var(--line)] overflow-hidden">
            <Section title="Assets"      items={assets}      total={totalAssets}      color="bg-blue-500/5 text-blue-800" />
            <Section title="Liabilities" items={liabilities} total={totalLiabilities} color="bg-red-500/5 text-red-800" />

            {/* Equity + Retained Earnings */}
            <div className="border-b border-[var(--line)]">
              <div className="bg-purple-500/5 px-5 py-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-purple-800">Equity</p>
              </div>
              {equity.map((e) => (
                <div key={e.code} className="flex items-center justify-between px-5 py-2.5 odd:bg-[var(--bg)] even:bg-[var(--panel)]/40">
                  <div><span className="font-mono text-xs text-[var(--accent)] mr-2">{e.code}</span><span className="text-sm">{e.name}</span></div>
                  <span className="text-sm tabular-nums">{formatMoney(e.balance, currency)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-2.5 odd:bg-[var(--bg)]">
                <span className="text-sm text-[var(--ink-muted)] italic">Retained Earnings (net income)</span>
                <span className={`text-sm tabular-nums ${retainedEarnings >= 0 ? "" : "text-red-600"}`}>{formatMoney(retainedEarnings, currency)}</span>
              </div>
              <div className="flex items-center justify-between bg-purple-500/10 px-5 py-3 font-bold border-t border-[var(--line)]">
                <span className="text-sm text-purple-800">Total Equity</span>
                <span className="text-sm text-purple-800 tabular-nums">{formatMoney(totalEquityAndRetained, currency)}</span>
              </div>
            </div>

            {/* Equation check */}
            <div className={`px-5 py-4 flex items-center justify-between ${balanced ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <span className="text-sm font-bold text-[var(--ink)]">Total Liabilities + Equity</span>
              <span className={`text-lg font-bold tabular-nums ${balanced ? "text-green-700" : "text-red-700"}`}>
                {formatMoney(totalLiabilities + totalEquityAndRetained, currency)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
